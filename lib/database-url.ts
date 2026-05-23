export function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or DIRECT_URL environment variable");
  }

  return ensureSslMode(connectionString);
}

export function ensureSslMode(connectionString: string) {
  const url = new URL(connectionString);

  if (url.protocol.startsWith("postgres") && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }

  if (url.protocol.startsWith("postgres") && !url.searchParams.has("uselibpqcompat")) {
    url.searchParams.set("uselibpqcompat", "true");
  }

  return url.toString();
}