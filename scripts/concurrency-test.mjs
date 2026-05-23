#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or DIRECT_URL environment variable for concurrency test");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const timestamp = Date.now().toString().slice(-6);
  const productId = `test_product_${timestamp}`;
  const warehouseId = "wh_east";
  const totalStock = Number(process.env.TEST_TOTAL_STOCK ? Number(process.env.TEST_TOTAL_STOCK) : 3);
  const concurrentRequests = Number(process.env.TEST_CONCURRENT_REQUESTS ? Number(process.env.TEST_CONCURRENT_REQUESTS) : 10);

  console.log(`Preparing test product ${productId} in ${warehouseId} with stock=${totalStock}`);

  await prisma.product.upsert({
    where: { id: productId },
    update: {},
    create: {
      id: productId,
      name: `Test Product ${timestamp}`,
      price: new Prisma.Decimal("1.00"),
    },
  });

  await prisma.inventory.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { totalQuantity: totalStock, reservedQuantity: 0 },
    create: { productId, warehouseId, totalQuantity: totalStock, reservedQuantity: 0 },
  });

  const attempts = Array.from({ length: concurrentRequests }, () => makeReservation(productId, warehouseId));
  const results = await Promise.allSettled(attempts.map((fn) => fn()));

  const successes = results.filter((r) => r.status === "fulfilled").length;
  const failures = results.filter((r) => r.status === "rejected").length;

  console.log(`Concurrent requests: ${concurrentRequests}, successes: ${successes}, failures: ${failures}`);

  const inventory = await prisma.inventory.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  const reservations = await prisma.reservation.findMany({ where: { inventoryId: inventory.id } });

  const pending = reservations.filter((r) => r.status === "PENDING").length;
  const confirmed = reservations.filter((r) => r.status === "CONFIRMED").length;

  console.log(`DB inventory: total=${inventory.totalQuantity}, reserved=${inventory.reservedQuantity}`);
  console.log(`Reservations count: total=${reservations.length}, pending=${pending}, confirmed=${confirmed}`);

  if (inventory.reservedQuantity > inventory.totalQuantity) {
    console.error("TEST FAILED: reservedQuantity > totalQuantity (oversell)");
    process.exit(1);
  }

  if (successes > totalStock) {
    console.error("TEST FAILED: More successful reservations than stock");
    process.exit(1);
  }

  console.log("TEST PASSED: no oversell detected");
  process.exit(0);
}

function makeReservation(productId, warehouseId) {
  return async () => {
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch(`${BASE_URL}/api/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(`HTTP ${response.status} ${payload?.error?.message ?? ""}`);
    }

    return response.json();
  };
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
