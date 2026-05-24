#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or DIRECT_URL environment variable");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const productsRes = await fetch(`${BASE_URL}/api/products`);
  const productsPayload = await productsRes.json();
  const productId = productsPayload?.data?.products?.[0]?.id;

  const warehousesRes = await fetch(`${BASE_URL}/api/warehouses`);
  const warehousesPayload = await warehousesRes.json();
  const warehouseId = warehousesPayload?.data?.warehouses?.[0]?.id;

  if (!productId || !warehouseId) {
    throw new Error("Missing product or warehouse seed data");
  }

  const createRes = await fetch(`${BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      productId,
      warehouseId,
      quantity: 1,
    }),
  });

  const createPayload = await createRes.json();

  if (createRes.status !== 201) {
    throw new Error(`Create reservation failed: ${createRes.status} ${JSON.stringify(createPayload)}`);
  }

  const reservationId = createPayload.data.id;

  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      expiresAt: new Date(Date.now() - 60_000),
    },
  });

  const firstCleanupRes = await fetch(`${BASE_URL}/api/reservations/cleanup`);
  const firstCleanup = await firstCleanupRes.json();

  const secondCleanupRes = await fetch(`${BASE_URL}/api/reservations/cleanup`);
  const secondCleanup = await secondCleanupRes.json();

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      inventory: true,
    },
  });

  if (!reservation) {
    throw new Error("Reservation not found after cleanup");
  }

  console.log(`first_cleanup_status=${firstCleanupRes.status}`);
  console.log(`first_cleanup_expired_count=${firstCleanup?.data?.expiredCount ?? ""}`);
  console.log(`second_cleanup_status=${secondCleanupRes.status}`);
  console.log(`second_cleanup_expired_count=${secondCleanup?.data?.expiredCount ?? ""}`);
  console.log(`reservation_status=${reservation.status}`);
  console.log(`inventory_reserved_quantity=${reservation.inventory.reservedQuantity}`);

  if (reservation.status !== "RELEASED") {
    throw new Error(`Expected RELEASED reservation, got ${reservation.status}`);
  }

  if (reservation.inventory.reservedQuantity < 0) {
    throw new Error("reservedQuantity became negative");
  }

  console.log("cleanup_idempotency_test=passed");
}

await main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });