// Local throwaway Postgres 17 (embedded-postgres, no Docker) with the Supabase
// shim and all migrations applied. Used by database tests and type generation.
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SHIM = join(ROOT, "supabase", "tests", "supabase-shim.sql");
export const TEMPLATE_DB = "ayra_template";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startLocalPostgres() {
  const port = await freePort();
  const databaseDir = await mkdtemp(join(tmpdir(), "ayra-pg-"));
  const server = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  const connection = { host: "127.0.0.1", port, user: "postgres", password: "postgres" };
  return { server, connection };
}

export async function migrationFiles() {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Creates `name` with the shim and every migration applied, each migration in its own transaction.
 * `autoExpose: false` emulates Supabase projects that do not grant API roles access to new tables
 * automatically; there, only explicit grants in the migrations count.
 */
export async function createMigratedDatabase(connection, name = TEMPLATE_DB, { autoExpose = true } = {}) {
  const admin = new pg.Client({ ...connection, database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const client = new pg.Client({ ...connection, database: name });
  await client.connect();
  try {
    const shim = await readFile(SHIM, "utf8");
    await client.query(autoExpose ? shim : shim.replace(/^alter default privileges .*;$/gm, ""));
    for (const file of await migrationFiles()) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }
    }
  } finally {
    await client.end();
  }
}
