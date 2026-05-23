import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getDatabaseUrl } from "../lib/database-url";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

async function hasSchema() {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'products'
    ) AS "exists"
  `;

  return result[0]?.exists ?? false;
}

function splitSqlStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyMigrationFile(filePath: string) {
  const migrationSql = await readFile(filePath, "utf8");
  const statements = splitSqlStatements(migrationSql);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function main() {
  const schemaExists = await hasSchema();

  if (schemaExists) {
    console.log("Schema already exists, skipping migration apply.");
    return;
  }

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const migrationFolders = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrationFolders.length === 0) {
    throw new Error("No Prisma migrations were found.");
  }

  for (const folderName of migrationFolders) {
    const migrationFile = path.join(migrationsDir, folderName, "migration.sql");
    console.log(`Applying ${folderName}...`);
    await applyMigrationFile(migrationFile);
  }

  console.log("Migration SQL applied successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });