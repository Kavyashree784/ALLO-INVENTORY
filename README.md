# Allo Inventory

Allo Inventory is a concurrency-safe inventory reservation system for multi-warehouse retail. It demonstrates how to prevent overselling under heavy concurrent checkout traffic using PostgreSQL row locks, transactional state transitions, and idempotent reservation creation.

The application is built with Next.js App Router, Prisma, PostgreSQL, TanStack Query, Zod, Tailwind CSS, and shadcn-style primitives. 

## Project Overview

The system models a catalog of products stocked across warehouses. A user selects a product, chooses a warehouse, and creates a temporary reservation that removes stock from availability for a bounded time window. The user can then confirm payment or cancel the hold. Expired holds are reclaimed automatically.

The goal of the project is not just to work in the happy path, but to remain correct when several users attempt to reserve the last unit at the same time.

## Architecture Decisions

### Single-warehouse reservations

Each reservation is tied to exactly one inventory row, which represents one product in one warehouse. This keeps the locking scope small and deterministic:

- one reservation touches one inventory row
- one lock protects the availability check and the stock mutation
- the database can serialize competing requests without complex allocation logic

This design was chosen over split allocations across multiple warehouses because split allocation introduces additional coordination, harder rollback logic, and a much larger race-condition surface.

### Why naive reservation logic fails

A naive implementation usually does this:

1. read available stock
2. verify enough stock exists
3. write the reservation
4. decrement inventory

That is unsafe under concurrency. Two requests can both read the same available quantity before either writes anything. If there is one unit left, both may succeed and oversell the item.

The fix is not to make the read faster. The fix is to make the check-and-update atomic from the perspective of concurrent transactions.

### Concurrency strategy

The reservation service uses:

- PostgreSQL row-level locking with `SELECT ... FOR UPDATE`
- Prisma transactions for atomic state transitions
- atomic `increment` and `decrement` updates on inventory counters
- idempotency keys for safe client retries

Serializable transactions and advisory locks are not used. They are not required for this design because the inventory row lock is the actual concurrency boundary.

## Architecture Diagram

```mermaid
flowchart LR
  UI[Next.js UI] --> API[App Router API]
  API --> SVC[Reservation Service]
  SVC --> TX[Prisma Transaction]
  TX --> LOCK[SELECT ... FOR UPDATE on Inventory]
  TX --> DB[(PostgreSQL)]
  UI -->|React Query| API
  CRON[Vercel Cron] --> API2[/api/reservations/cleanup/]
  API2 --> SVC
```

## Database Schema Overview

The core schema contains four entities:

- `Product` - catalog item metadata and pricing
- `Warehouse` - physical fulfillment location
- `Inventory` - one row per product and warehouse combination
- `Reservation` - temporary stock hold with lifecycle state

### Database Relationship Diagram

```mermaid
erDiagram
  PRODUCT ||--o{ INVENTORY : has
  WAREHOUSE ||--o{ INVENTORY : stores
  INVENTORY ||--o{ RESERVATION : reserves

  PRODUCT {
    string id PK
    string name
    string description
    decimal price
  }

  WAREHOUSE {
    string id PK
    string name
    string location
  }

  INVENTORY {
    string id PK
    string productId FK
    string warehouseId FK
    int totalQuantity
    int reservedQuantity
  }

  RESERVATION {
    string id PK
    string inventoryId FK
    int quantity
    string status
    datetime expiresAt
    string idempotencyKey
    datetime confirmedAt
    datetime releasedAt
  }
```

### Important columns and constraints

- `Inventory.productId` + `Inventory.warehouseId` is unique
- `Reservation.idempotencyKey` is unique
- `Reservation.status` supports `PENDING`, `CONFIRMED`, and `RELEASED`
- `Inventory.totalQuantity` and `Inventory.reservedQuantity` drive availability

## Concurrency Correctness

This is the most important part of the system.

### Race condition example

Imagine two customers racing for the final unit in the same warehouse:

1. Request A reads available stock = 1
2. Request B reads available stock = 1
3. Request A creates a reservation
4. Request B also creates a reservation

Without locking, both requests would appear valid and oversell would occur.

### Lock acquisition

Reservation creation begins by loading the target inventory row and then acquiring a row lock:

```sql
SELECT id FROM "inventory" WHERE id = $1 FOR UPDATE
```

This means only one transaction can own that inventory row at a time. The second transaction waits until the first one finishes.

### Transaction flow

The creation flow is:

1. start a Prisma transaction
2. load the inventory row for the selected product and warehouse
3. lock that inventory row with `FOR UPDATE`
4. reclaim any stale pending reservations for that inventory row
5. re-read inventory availability inside the same transaction
6. reject the request with `409 Conflict` if stock is insufficient
7. create the reservation row
8. increment `reservedQuantity`
9. commit the transaction

Confirmation follows the same lock discipline and also decrements `totalQuantity` when a hold is finalized, so sold stock is removed from availability rather than lingering forever in reserved counters.

Because the availability check and the counter update happen inside the same locked transaction, another request cannot sneak in between them.

### Why overselling is impossible

Overselling is prevented because the critical section is protected by the database:

- only one transaction can hold the inventory row lock
- every competing request must wait for that lock
- after the first transaction commits, the next request re-reads the updated stock
- if stock is gone, the second request fails with `409 Conflict`

There is no read-then-write gap that another request can exploit.

### Why row locking is sufficient here

This system reserves stock from one warehouse per reservation. That makes the concurrency problem local to one inventory row, so row-level locking is the right abstraction.

Serializable isolation would also work, but it would add more complexity and more opportunities for retry handling without improving correctness for this specific shape.

Advisory locks are unnecessary because the row itself is the shared resource being protected.

## Reservation Lifecycle

The reservation state machine is:

1. `PENDING` - hold exists and stock is reserved
2. `CONFIRMED` - payment succeeded and the hold becomes permanent
3. `RELEASED` - hold was manually canceled or expired and stock was returned

### Lifecycle behavior

- Create reservation: `PENDING`
- Confirm reservation: transitions `PENDING` -> `CONFIRMED`
- Release reservation: transitions `PENDING` -> `RELEASED`
- Expiry cleanup: transitions stale `PENDING` -> `RELEASED`

## Expiry Strategy

Reservations have a TTL controlled by `RESERVATION_TTL_MINUTES`.

Expiry is handled in two ways:

- **Lazy expiry** - mutation and detail paths check expiry and reject stale confirmation attempts with `410 Gone`
- **Cleanup expiry** - the cleanup route reclaims expired reservations in batch

The lazy path keeps the system correct even if the cleanup job is delayed.

## Cron Cleanup Strategy

The cleanup endpoint is exposed at `/api/reservations/cleanup` and is scheduled by Vercel Cron in [vercel.json](vercel.json).

The route:

- finds inventories with stale pending reservations
- locks each affected inventory row
- marks expired reservations as `RELEASED`
- decrements `reservedQuantity` accordingly

This keeps inventory counters aligned even for holds that expire without user action.

## Idempotency

Idempotency is implemented for `POST /api/reservations` using the `Idempotency-Key` header.

If the same key is retried:

- the existing reservation is returned if the request body matches the original reservation intent
- a `409 Conflict` is returned if the same key is reused for a different reservation request

This protects clients from creating duplicate reservations when they retry after a timeout or transient network error.

## API Endpoints

### `GET /api/products`

Returns all products with per-warehouse inventory and derived availability.

Response shape:

```json
{
  "success": true,
  "data": {
    "products": [],
    "warehouses": []
  }
}
```

### `GET /api/warehouses`

Returns all warehouses.

### `POST /api/reservations`

Creates a reservation.

Request body:

```json
{
  "productId": "prod_alpha",
  "warehouseId": "wh_east",
  "quantity": 2
}
```

Optional header:

```text
Idempotency-Key: <uuid>
```

Responses:

- `201 Created` on success
- `409 Conflict` when stock is insufficient or the idempotency key is reused incorrectly
- `404 Not Found` when the requested inventory row does not exist

### `GET /api/reservations/:id`

Returns reservation details for the reservation workspace page.

### `POST /api/reservations/:id/confirm`

Confirms an active reservation.

Responses:

- `200 OK` if the reservation is confirmed
- `410 Gone` if the reservation already expired
- `404 Not Found` if the reservation does not exist

Example:

```bash
curl -X POST http://localhost:3000/api/reservations/cmp123/confirm
```

### `POST /api/reservations/:id/release`

Releases a reservation.

This route is idempotent. Releasing an already released reservation returns the current released state without double-decrementing stock.

Example:

```bash
curl -X POST http://localhost:3000/api/reservations/cmp123/release
```

### `GET /api/reservations/cleanup`

Runs the expiry cleanup job.

### `POST /api/reservations/cleanup`

Alias for the cleanup job, useful for manual triggering.

## Tradeoffs Made

- One warehouse per reservation was chosen to keep concurrency bounded to a single locked row.
- The system uses lazy expiry plus cron cleanup instead of cron-only cleanup so stale holds are handled even if the scheduled job is delayed.
- Prisma transactions are used for clarity and maintainability instead of raw SQL everywhere, with targeted `FOR UPDATE` queries where lock control matters.
- The app is optimized for correctness and reviewer readability rather than maximizing allocation flexibility.

## Future Improvements

- Add integration tests for concurrent last-unit reservation behavior.
- Add a reservation cancellation button in the catalog flow.
- Add warehouse ranking or allocation logic for multi-warehouse fallback reservation.
- Add operational dashboards for expired holds and cleanup frequency.
- Move cleanup scheduling metrics into observability tooling.

## Environment Variables

Copy [\.env.example](.env.example) to `.env` and set:

```bash
DATABASE_URL="postgresql://user:password@host:5432/db?schema=public"
DIRECT_URL="postgresql://user:password@host:5432/db?schema=public"
RESERVATION_TTL_MINUTES="10"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
```

Notes:

- `DATABASE_URL` is used by the app runtime and local migration bootstrap.
- `DIRECT_URL` is optional if you only have one working database URL.
- The Supabase variables are optional unless you wire in the auth helpers.

## Local Setup

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Then open `http://localhost:3000`.

## Seed Instructions

The seed script creates:

- 2 warehouses
- 4 products
- 8 inventory rows

Run it with:

```bash
npm run db:seed
```

## Testing Instructions

Run the repository checks with:

```bash
npm run lint
npm run typecheck
npm run build
```

Recommended manual verification flow:

1. Open the catalog page.
2. Create a reservation.
3. Confirm it.
4. Create another reservation and release it.
5. Verify the reservation detail page shows countdown and status updates.
6. Verify expired reservations return `410 Gone` on confirm.

## Deployment Instructions

### Vercel

1. Create a PostgreSQL database on Neon or Supabase.
2. Set `DATABASE_URL`, `DIRECT_URL`, and `RESERVATION_TTL_MINUTES` in Vercel.
3. Deploy the app.
4. Run `npm run db:migrate` against production.
5. Run `npm run db:seed` if you want the demo data in production.
6. Ensure the Vercel Cron entry from [vercel.json](vercel.json) remains enabled.
7. If you want CI verification, run the `Concurrency Test` workflow in GitHub Actions; it provisions Postgres, migrates, seeds, and executes `npm run test:concurrency`.

### Production migration workflow

Use the repository migration script:

```bash
npm run db:migrate
```

This applies the checked-in Prisma migration SQL in a deterministic way against the configured PostgreSQL database.

## Notes

- The UI is split into a catalog page and a reservation workspace page.
- Payment processing is intentionally out of scope; confirmation simulates a successful payment flow.
- The codebase is organized to make the concurrency story easy to review and explain. 

