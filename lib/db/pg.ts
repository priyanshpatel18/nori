import { promises as dns } from "node:dns";

import { Pool, type PoolConfig } from "pg";

// Some networks publish AAAA records but have no working IPv6 route.
// Node's Happy Eyeballs races both families and the dead IPv6 path stalls
// every connection until timeout. We resolve the hostname to an IPv4
// address up-front and pass it as `host`, while keeping the original
// hostname as the TLS SNI servername so cert verification still works.

let cachedConfigPromise: Promise<PoolConfig> | null = null;

async function buildConfig(): Promise<PoolConfig> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set.");

  const u = new URL(url.replace("postgresql://", "postgres://"));
  const hostname = u.hostname;

  const { address: ipv4 } = await dns.lookup(hostname, { family: 4 });

  return {
    host: ipv4,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false, servername: hostname },
    connectionTimeoutMillis: 15_000,
    max: 5,
  };
}

let cachedPool: Pool | null = null;
async function getPool(): Promise<Pool> {
  if (cachedPool) return cachedPool;
  if (!cachedConfigPromise) cachedConfigPromise = buildConfig();
  const cfg = await cachedConfigPromise;
  cachedPool = new Pool(cfg);
  return cachedPool;
}

declare global {
  var pgPoolGetter: undefined | (() => Promise<Pool>);
}

export const getDbPool = global.pgPoolGetter ?? getPool;

if (process.env.NODE_ENV !== "production") global.pgPoolGetter = getPool;
