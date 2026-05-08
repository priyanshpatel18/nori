import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __noriPrisma: PrismaClient | undefined;
}

// Use node-postgres via @prisma/adapter-pg instead of @prisma/adapter-neon.
// The Neon adapter ships two transports (WebSocket and HTTPS fetch) and
// both fail in this environment with opaque "fetch failed" / ErrorEvent
// errors after a 10s timeout. The plain pg/TCP path is the same one
// `prisma migrate dev` uses successfully, so connectivity over that
// channel is already proven.
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.__noriPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__noriPrisma = prisma;
}
