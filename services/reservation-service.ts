import { addMinutes } from "date-fns";
import { Prisma } from "@prisma/client";

import { ConflictError, GoneError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { serializeReservation, type ReservationWithInventory } from "@/lib/serializers";
import type { CreateReservationInput } from "@/schemas/reservation";

type Tx = Prisma.TransactionClient;

const reservationWithInventoryInclude = {
  include: {
    inventory: {
      include: {
        product: true,
        warehouse: true,
      },
    },
  },
} as const;

const DEFAULT_TTL_MINUTES = Number.parseInt(process.env.RESERVATION_TTL_MINUTES ?? "10", 10);

function getReservationExpiry(now = new Date()) {
  return addMinutes(now, Number.isFinite(DEFAULT_TTL_MINUTES) ? DEFAULT_TTL_MINUTES : 10);
}

async function lockInventoryRow(tx: Tx, inventoryId: string) {
  await tx.$queryRaw`SELECT id FROM "inventory" WHERE id = ${inventoryId} FOR UPDATE`;
}

async function lockReservationRow(tx: Tx, reservationId: string) {
  await tx.$queryRaw`SELECT id FROM "reservations" WHERE id = ${reservationId} FOR UPDATE`;
}

async function getReservationById(tx: Tx, reservationId: string) {
  return tx.reservation.findUnique({
    where: { id: reservationId },
    ...reservationWithInventoryInclude,
  });
}

async function getReservationByKey(tx: Tx, idempotencyKey: string) {
  return tx.reservation.findUnique({
    where: { idempotencyKey },
    ...reservationWithInventoryInclude,
  });
}

function ensureReservationExists(reservation: ReservationWithInventory | null) {
  if (!reservation) {
    throw new NotFoundError("Reservation not found");
  }

  return reservation;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function expirePendingReservationsForInventory(tx: Tx, inventoryId: string, now = new Date()) {
  const staleReservations = await tx.$queryRaw<Array<{ id: string; quantity: number }>>`
    SELECT id, quantity
    FROM "reservations"
    WHERE "inventoryId" = ${inventoryId}
      AND status = 'PENDING'
      AND "expiresAt" <= ${now}
    FOR UPDATE
  `;

  if (staleReservations.length === 0) {
    return 0;
  }

  const expiredQuantity = staleReservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
  const expiredIds = staleReservations.map((reservation) => reservation.id);

  await tx.reservation.updateMany({
    where: {
      id: { in: expiredIds },
      status: "PENDING",
    },
    data: {
      status: "RELEASED",
      releasedAt: now,
    },
  });

  await tx.inventory.update({
    where: { id: inventoryId },
    data: {
      reservedQuantity: {
        decrement: expiredQuantity,
      },
    },
  });

  return expiredQuantity;
}

function hasMatchingReservationIntent(
  reservation: ReservationWithInventory,
  input: CreateReservationInput,
  inventoryId: string
) {
  return (
    reservation.inventory.id === inventoryId &&
    reservation.inventory.product.id === input.productId &&
    reservation.inventory.warehouse.id === input.warehouseId &&
    reservation.quantity === input.quantity
  );
}

export async function createReservation(input: CreateReservationInput, idempotencyKey?: string | null) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!inventory) {
      throw new NotFoundError("Inventory row not found for the requested product and warehouse");
    }

    await lockInventoryRow(tx, inventory.id);
    await expirePendingReservationsForInventory(tx, inventory.id, now);

    if (idempotencyKey) {
      const existing = await getReservationByKey(tx, idempotencyKey);

      if (existing) {
        if (!hasMatchingReservationIntent(existing, input, inventory.id)) {
          throw new ConflictError("Idempotency key was already used for a different reservation request");
        }

        return serializeReservation(existing);
      }
    }

    const refreshedInventory = await tx.inventory.findUnique({
      where: { id: inventory.id },
    });

    if (!refreshedInventory) {
      throw new NotFoundError("Inventory row not found");
    }

    const availableQuantity = refreshedInventory.totalQuantity - refreshedInventory.reservedQuantity;

    if (availableQuantity < input.quantity) {
      throw new ConflictError("Insufficient available stock for the requested reservation");
    }

    let reservation;

    try {
      reservation = await tx.reservation.create({
        data: {
          inventoryId: inventory.id,
          quantity: input.quantity,
          expiresAt: getReservationExpiry(now),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      });
    } catch (error) {
      if (!idempotencyKey || !isUniqueConstraintError(error)) {
        throw error;
      }

      const existingAfterConflict = await getReservationByKey(tx, idempotencyKey);

      if (existingAfterConflict) {
        if (!hasMatchingReservationIntent(existingAfterConflict, input, inventory.id)) {
          throw new ConflictError("Idempotency key was already used for a different reservation request");
        }

        return serializeReservation(existingAfterConflict);
      }

      throw error;
    }

    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        reservedQuantity: {
          increment: input.quantity,
        },
      },
    });

    const createdReservation = await getReservationById(tx, reservation.id);
    return serializeReservation(ensureReservationExists(createdReservation));
  });
}

export async function getReservationDetails(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    ...reservationWithInventoryInclude,
  });

  if (!reservation) {
    throw new NotFoundError("Reservation not found");
  }

  return serializeReservation(reservation);
}

export async function getRecentReservations(limit = 12) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 12;

  const [reservations, totalCount, pendingCount, confirmedCount, releasedCount, expiredCount, expiringSoonCount] = await Promise.all([
    prisma.reservation.findMany({
      take: safeLimit,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      ...reservationWithInventoryInclude,
    }),
    prisma.reservation.count(),
    prisma.reservation.count({ where: { status: "PENDING" } }),
    prisma.reservation.count({ where: { status: "CONFIRMED" } }),
    prisma.reservation.count({ where: { status: "RELEASED" } }),
    prisma.reservation.count({
      where: {
        status: "PENDING",
        expiresAt: {
          lte: new Date(),
        },
      },
    }),
    prisma.reservation.count({
      where: {
        status: "PENDING",
        expiresAt: {
          gt: new Date(),
          lte: new Date(Date.now() + 30 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    reservations: reservations.map(serializeReservation),
    summary: {
      totalCount,
      pendingCount,
      confirmedCount,
      releasedCount,
      expiredCount,
      expiringSoonCount,
    },
  };
}

export async function confirmReservation(reservationId: string) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const reservation = ensureReservationExists(await getReservationById(tx, reservationId));

    await lockInventoryRow(tx, reservation.inventoryId);
    await expirePendingReservationsForInventory(tx, reservation.inventoryId, now);
    await lockReservationRow(tx, reservation.id);

    const currentReservation = ensureReservationExists(await getReservationById(tx, reservation.id));

    if (currentReservation.status === "CONFIRMED") {
      return serializeReservation(currentReservation);
    }

    if (currentReservation.expiresAt.getTime() <= now.getTime()) {
      throw new GoneError("Reservation expired before confirmation");
    }

    if (currentReservation.status === "RELEASED") {
      throw new ConflictError("Reservation has already been released");
    }

    const confirmed = await tx.reservation.update({
      where: { id: currentReservation.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: now,
      },
      ...reservationWithInventoryInclude,
    });

    // Move stock from reserved -> sold: decrement both reservedQuantity and totalQuantity
    await tx.inventory.update({
      where: { id: currentReservation.inventoryId },
      data: {
        reservedQuantity: {
          decrement: currentReservation.quantity,
        },
        totalQuantity: {
          decrement: currentReservation.quantity,
        },
      },
    });

    const refreshed = await getReservationById(tx, confirmed.id);
    return serializeReservation(ensureReservationExists(refreshed));
  });
}

export async function releaseReservation(reservationId: string) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const reservation = ensureReservationExists(await getReservationById(tx, reservationId));

    await lockInventoryRow(tx, reservation.inventoryId);
    await expirePendingReservationsForInventory(tx, reservation.inventoryId, now);
    await lockReservationRow(tx, reservation.id);

    const currentReservation = ensureReservationExists(await getReservationById(tx, reservation.id));

    if (currentReservation.status === "CONFIRMED") {
      return serializeReservation(currentReservation);
    }

    if (currentReservation.status === "RELEASED") {
      return serializeReservation(currentReservation);
    }

    const released = await tx.reservation.update({
      where: { id: currentReservation.id },
      data: {
        status: "RELEASED",
        releasedAt: now,
      },
      ...reservationWithInventoryInclude,
    });

    await tx.inventory.update({
      where: { id: currentReservation.inventoryId },
      data: {
        reservedQuantity: {
          decrement: currentReservation.quantity,
        },
      },
    });

    const refreshed = await getReservationById(tx, released.id);
    return serializeReservation(ensureReservationExists(refreshed));
  });
}

export async function cleanupExpiredReservations() {
  const now = new Date();

  const inventoryIds = await prisma.inventory.findMany({
    where: {
      reservations: {
        some: {
          status: "PENDING",
          expiresAt: {
            lte: now,
          },
        },
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  let expiredCount = 0;

  for (const inventory of inventoryIds) {
    await prisma.$transaction(async (tx) => {
      await lockInventoryRow(tx, inventory.id);
      expiredCount += await expirePendingReservationsForInventory(tx, inventory.id, now);
    });
  }

  return { expiredCount };
}