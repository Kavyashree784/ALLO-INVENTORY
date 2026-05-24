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

  const confirmRes = await fetch(`${BASE_URL}/api/reservations/${reservationId}/confirm`, {
    method: "POST",
  });
  const confirmPayload = await confirmRes.json();

  console.log(`expired_confirm_status=${confirmRes.status}`);
  console.log(`expired_confirm_code=${confirmPayload?.error?.code ?? ""}`);

  if (confirmRes.status !== 410) {
    throw new Error(`Expected HTTP 410, got ${confirmRes.status}`);
  }

  console.log("expired_confirm_test=passed");
}

await main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });