# Allo Inventory

Allo Inventory is a focused demo of concurrency-safe inventory reservation for multi-warehouse retail. It is intentionally small and engineered to demonstrate practical techniques that prevent overselling under concurrent traffic: targeted row locking, atomic transactions, clear lifecycle transitions, and idempotent client behavior.

Tech stack: Next.js (App Router), TypeScript, Prisma, PostgreSQL, TanStack Query (React Query), Zod, Tailwind CSS, and shadcn-style UI primitives.

## Project overview

This repo models an inventory reservation system where each product may have stock across multiple warehouses. The primary user flow is:

- create a short-lived reservation (hold) on a single warehouse inventory row
- confirm the reservation to finalize the sale
- release the reservation to return stock to availability
- automated cleanup reclaims expired holds

The core objective is correctness under concurrency: the system prevents overselling by keeping the check-and-update critical section small and protected by the database.

## Architecture decisions (summary)

Key constraints that guided the design:

- Keep the concurrency boundary small: one reservation locks one inventory row (product + warehouse). This minimizes contention and makes correctness easy to reason about.
- Use database transactions to perform the availability check and stock mutation atomically.
- Provide idempotency for reservation creation so clients can safely retry without creating duplicates.

Why this shape?

- Multi-warehouse split allocations increase complexity and rollback surface area; the single-row allocation keeps the critical path trivial to lock.
- Row-level locking (SELECT ... FOR UPDATE) provides the necessary serialization with minimal operational overhead.

## Architecture diagram

```mermaid
flowchart LR
  UI[Next.js UI] -->|React Query| API[App Router API]
  API --> SVC[Reservation Service]
  SVC --> TX[Prisma Transaction]
  TX --> LOCK[SELECT ... FOR UPDATE on inventory row]
  TX --> DB[(PostgreSQL)]
  CRON[Vercel Cron] --> API2[/api/reservations/cleanup]
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


## Reservation lifecycle

States:

- PENDING — temporary hold, inventory reserved
- CONFIRMED — payment captured, stock finalized
- RELEASED — hold canceled or reclaimed

Transitions:

- Create -> PENDING
- PENDING -> CONFIRMED (confirm action)
- PENDING -> RELEASED (manual release or expiry cleanup)

Expiry handling is defensive: mutation endpoints reject confirms for expired holds (HTTP 410) and a background cleanup job reclaims stale PENDING reservations in batches.


## Expiry strategy

Configuration:

- `RESERVATION_TTL_MINUTES` controls hold lifetime.

Mechanics:

- Lazy expiry: all mutating endpoints (confirm/release) verify reservation expiry and return `410 Gone` if stale. This prevents a client from confirming an already-expired hold.
- Cleanup job: the `/api/reservations/cleanup` route finds stale PENDING reservations, locks affected inventory rows, and transitions them to RELEASED while decrementing reserved counters.

This two-layer approach ensures correctness even if cron runs are delayed or missed.


## Cron cleanup

The cleanup route reclaims expired holds and should be scheduled (Vercel Cron, server cron, or similar). It performs batched work and locks each affected inventory row to ensure counter consistency.


## Idempotency

Reservation creation honors the `Idempotency-Key` header. Retries with the same key return the original reservation if the payload matches. If the key is reused for a different intent, the API returns `409 Conflict`.

## API overview

All API routes are under `/api`. Key endpoints:

### POST /api/reservations
Create a reservation. Use `Idempotency-Key` header to protect retries.

Responses:
- `201 Created` — reservation created
- `409 Conflict` — insufficient stock or idempotency key misuse
- `404 Not Found` — inventory row not found

### POST /api/reservations/:id/confirm
Confirm a PENDING reservation. Returns `410 Gone` if expired.

### POST /api/reservations/:id/release
Release a PENDING reservation. This is idempotent.

### GET /api/reservations/:id
Fetch reservation details for the reservation workspace.

### GET /api/reservations/cleanup
Run the expiry cleanup job (GET and POST supported for convenience).

### GET /api/products, GET /api/warehouses
Read-only endpoints used by the catalog UI.

See the inline OpenAPI-style examples in the code and the example curl snippets below.


Example confirm request:

```bash
curl -X POST http://localhost:3000/api/reservations/<id>/confirm
```


## Tradeoffs

- Single-warehouse reservations simplify correctness at the expense of allocation flexibility.
- Prisma provides maintainable transactions but abstracts SQL — raw SQL can be used for micro-optimizations if needed.
- The system favors clarity and reviewer aility over operational hardening (e.g., retries backoff, observability hooks, distributed tracing).


## Future improvements

- Add automated concurrency tests that use parallel clients to assert no oversell.
- Add observability: metrics for cleanup runs, expired holds, and lock contention.
- Consider multi-warehouse allocation with deterministic fallback and compensation.
- Add CI steps that run migration against a test database and execute the concurrency test suite.


## Environment variables

Copy `.env.example` to `.env` and set the typical values:

```bash
DATABASE_URL="postgresql://user:password@host:5432/db?schema=public"
DIRECT_URL="postgresql://user:password@host:5432/db?schema=public"
RESERVATION_TTL_MINUTES="10"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
```

Notes:

- `DATABASE_URL` is required for runtime and migrations.
- `DIRECT_URL` can be used as an alternate connection string for admin operations.
- Supabase vars are optional unless you enable the Supabase auth helpers.


## Local setup

1. Install dependencies:

```bash
npm install
```

2. Prepare the database and seed demo data (local Postgres required):

```bash
npm run db:migrate
npm run db:seed
```

3. Start the dev server:

```bash
npm run dev
```

Open http://localhost:3000.

## Seed Instructions

The seed script creates:

- 2 warehouses
- 4 products
- 8 inventory rows

Run it with:

```bash
npm run db:seed
```


## Checks (recommended before submission)

Run the static checks and build:

```bash
npm run lint
npm run typecheck
npm run build
```

Manual verification (smoke test):

1. Create a reservation from the catalog.
2. Confirm it and observe inventory counters.
3. Create a reservation and let it expire; attempt confirm and expect `410 Gone`.
4. Trigger `/api/reservations/cleanup` and confirm expired holds are reclaimed.

## Deployment

This app deploys cleanly on Vercel but requires a Postgres database and migrations to be applied.

Steps (Vercel):

1. Create a Postgres database (Neon, Supabase, or Vercel Postgres).
2. Add the environment variables in the Vercel Project settings: `DATABASE_URL`, `DIRECT_URL`, `RESERVATION_TTL_MINUTES`, and `NEXT_PUBLIC_APP_URL`.
3. Deploy the project.
4. After deployment, run migrations against the production DB:

```bash
npm run db:migrate
```

5. (Optional) Seed demo data `npm run db:seed`.
6. Run production verification checks:

```bash
BASE_URL="https://<your-app>.vercel.app" npm run test:concurrency
BASE_URL="https://<your-app>.vercel.app" npm run test:expired-confirm
BASE_URL="https://<your-app>.vercel.app" npm run test:cleanup-idempotency
```

7. Ensure the Vercel Cron entry in `vercel.json` is enabled for periodic cleanup.

Supabase note:
- Use pooled connection for `DATABASE_URL` (pooler host/6543).
- Use direct connection for `DIRECT_URL` (db.<project-ref>.supabase.co:5432).

Vercel Hobby note:
- Cron jobs are limited to once per day. The default schedule in `vercel.json` is `0 0 * * *`.

## Notes

- UI: catalog + reservation workspace. The UI aims to be operational and reviewer-friendly rather than decorative.
- Payment: out of scope — confirmation simulates success.
- Focus: correctness under concurrency and clear reviewer experience.

---

If you want, I can also produce a short submission checklist and recommended commit staging message templates to go with this README.