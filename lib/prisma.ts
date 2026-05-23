import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "@/lib/database-url";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });

export const prisma =
  globalThis.__prismaClient ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}