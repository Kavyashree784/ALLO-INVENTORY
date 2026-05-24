import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "../lib/database-url";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const now = new Date();
const demoExpiry = new Date(now.getTime() + 12 * 60 * 1000);
const confirmedAt = new Date(now.getTime() - 6 * 60 * 1000);

const warehouses = [
  {
    id: "wh_east",
    name: "East Coast Hub",
    location: "New York, NY",
  },
  {
    id: "wh_west",
    name: "West Coast Hub",
    location: "Los Angeles, CA",
  },
];

const products = [
  {
    id: "prod_alpha",
    name: "Arc Flash Mechanical Keyboard",
    description: "Tactile 65% layout, hot-swap PCB, per-key RGB.",
    price: new Prisma.Decimal("149.99"),
    imageUrl: "https://placehold.co/600x400?text=Keyboard",
  },
  {
    id: "prod_beta",
    name: "Nomad Wireless Trackpad",
    description: "Haptic feedback, multi-touch gestures, USB-C charging.",
    price: new Prisma.Decimal("89.99"),
    imageUrl: "https://placehold.co/600x400?text=Trackpad",
  },
  {
    id: "prod_gamma",
    name: "Lumina 4K Monitor",
    description: '27" IPS panel, 144 Hz, HDR600, USB-C 90 W PD.',
    price: new Prisma.Decimal("499.99"),
    imageUrl: "https://placehold.co/600x400?text=Monitor",
  },
  {
    id: "prod_delta",
    name: "Stealth USB-C Hub",
    description: "7-in-1: 2× USB-A, 2× USB-C, HDMI, SD, microSD.",
    price: new Prisma.Decimal("49.99"),
    imageUrl: "https://placehold.co/600x400?text=Hub",
  },
  {
    id: "prod_epsilon",
    name: "Pulse Desk Lamp",
    description: "Warm-dim LED lamp with touch controls and timer.",
    price: new Prisma.Decimal("69.99"),
    imageUrl: "https://placehold.co/600x400?text=Lamp",
  },
];

const inventorySeeds = [
  // Healthy products
  { id: "inv_alpha_east", productId: "prod_alpha", warehouseId: "wh_east", totalQuantity: 36, reservedQuantity: 0 },
  { id: "inv_alpha_west", productId: "prod_alpha", warehouseId: "wh_west", totalQuantity: 32, reservedQuantity: 0 },
  { id: "inv_beta_east", productId: "prod_beta", warehouseId: "wh_east", totalQuantity: 24, reservedQuantity: 0 },
  { id: "inv_beta_west", productId: "prod_beta", warehouseId: "wh_west", totalQuantity: 27, reservedQuantity: 0 },
  // Medium inventory product
  { id: "inv_gamma_east", productId: "prod_gamma", warehouseId: "wh_east", totalQuantity: 11, reservedQuantity: 0 },
  { id: "inv_gamma_west", productId: "prod_gamma", warehouseId: "wh_west", totalQuantity: 6, reservedQuantity: 0 },
  // Low-stock product
  { id: "inv_delta_east", productId: "prod_delta", warehouseId: "wh_east", totalQuantity: 2, reservedQuantity: 1 },
  { id: "inv_delta_west", productId: "prod_delta", warehouseId: "wh_west", totalQuantity: 0, reservedQuantity: 0 },
  // Optional out-of-stock example
  { id: "inv_epsilon_east", productId: "prod_epsilon", warehouseId: "wh_east", totalQuantity: 0, reservedQuantity: 0 },
  { id: "inv_epsilon_west", productId: "prod_epsilon", warehouseId: "wh_west", totalQuantity: 0, reservedQuantity: 0 },
];

async function main() {
  console.log("🌱  Resetting and seeding curated demo data…");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      TRUNCATE TABLE "reservations", "inventory", "products", "warehouses"
      RESTART IDENTITY CASCADE
    `);

    await tx.warehouse.createMany({
      data: [...warehouses],
    });

    await tx.product.createMany({
      data: [...products],
    });

    await tx.inventory.createMany({
      data: [...inventorySeeds],
    });

    await tx.reservation.createMany({
      data: [
        {
          id: "res_demo_pending_delta",
          inventoryId: "inv_delta_east",
          quantity: 1,
          status: "PENDING",
          expiresAt: demoExpiry,
          idempotencyKey: "seed-pending-delta-east",
        },
        {
          id: "res_demo_confirmed_gamma",
          inventoryId: "inv_gamma_west",
          quantity: 1,
          status: "CONFIRMED",
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
          idempotencyKey: "seed-confirmed-gamma-west",
          confirmedAt,
        },
      ],
    });
  });

  console.log("✅  Seeded a curated catalog: 2 warehouses, 5 products, 10 inventory rows, 2 demo reservations.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
