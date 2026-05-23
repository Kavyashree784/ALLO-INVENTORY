// prisma/seed.ts

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";

import { getDatabaseUrl } from "../lib/database-url";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function main() {
  console.log("🌱  Seeding database…");

  // ── Warehouses ──────────────────────────────────────────
  const [wh1, wh2] = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: "wh_east" },
      update: {},
      create: {
        id: "wh_east",
        name: "East Coast Hub",
        location: "New York, NY",
      },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh_west" },
      update: {},
      create: {
        id: "wh_west",
        name: "West Coast Hub",
        location: "Los Angeles, CA",
      },
    }),
  ]);

  // ── Products ─────────────────────────────────────────────
  const products: Prisma.ProductCreateInput[] = [
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
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id as string },
      update: {},
      create: p,
    });
  }

  // ── Inventory (product × warehouse) ─────────────────────
  type InventorySeed = {
    productId: string;
    warehouseId: string;
    totalStock: number;
  };

  const inventorySeeds: InventorySeed[] = [
    // East Coast
    { productId: "prod_alpha", warehouseId: wh1.id, totalStock: 50 },
    { productId: "prod_beta",  warehouseId: wh1.id, totalStock: 30 },
    { productId: "prod_gamma", warehouseId: wh1.id, totalStock: 10 },
    { productId: "prod_delta", warehouseId: wh1.id, totalStock: 100 },
    // West Coast
    { productId: "prod_alpha", warehouseId: wh2.id, totalStock: 40 },
    { productId: "prod_beta",  warehouseId: wh2.id, totalStock: 20 },
    { productId: "prod_gamma", warehouseId: wh2.id, totalStock: 5  },
    { productId: "prod_delta", warehouseId: wh2.id, totalStock: 75 },
  ];

  for (const inv of inventorySeeds) {
    await prisma.inventory.upsert({
      where: {
        productId_warehouseId: {
          productId: inv.productId,
          warehouseId: inv.warehouseId,
        },
      },
      update: {},      // don't overwrite stock if re-running seed
      create: {
        productId: inv.productId,
        warehouseId: inv.warehouseId,
        totalQuantity: inv.totalStock,
        reservedQuantity: 0,
      },
    });
  }

  console.log(
    `✅  Seeded: 2 warehouses, ${products.length} products, ${inventorySeeds.length} inventory rows.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());