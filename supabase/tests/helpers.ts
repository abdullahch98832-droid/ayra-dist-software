import { randomUUID } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { TEMPLATE_DB } from "../../scripts/db/local-db.mjs";

export type Row = Record<string, unknown>;
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

/** An isolated database cloned from the migrated template. */
export interface TestDb {
  pool: pg.Pool;
  /** Runs as the database owner (bypasses RLS) — for fixtures and assertions. */
  sql: Query;
  /** Runs inside one transaction as an authenticated user (RLS applies). */
  as<T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T>;
  /** Runs inside one transaction as the anon role. */
  asAnon<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  /** Creates an auth user (profile created by trigger) with the given role code. */
  createUser(roleCode: string | null, options?: { employeeId?: string }): Promise<string>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const connection = inject("pgConnection");
  const name = `t_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ ...connection, database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${name} template ${TEMPLATE_DB}`);
  await admin.end();

  const pool = new pg.Pool({ ...connection, database: name, max: 12 });

  const sql: Query = async (text, params) => (await pool.query(text, params)).rows;

  async function inRole<T>(role: "authenticated" | "anon", userId: string | null, fn: (q: Query) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${role}`);
      if (userId) {
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: userId, role }),
        ]);
      }
      const result = await fn(async (text, params) => (await client.query(text, params)).rows);
      const commit = await client.query("commit");
      // COMMIT of an aborted transaction silently becomes ROLLBACK.
      if (commit.command === "ROLLBACK") {
        throw new Error("Transaction was aborted by an earlier error and rolled back");
      }
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    sql,
    as: (userId, fn) => inRole("authenticated", userId, fn),
    asAnon: (fn) => inRole("anon", null, fn),
    async createUser(roleCode, options = {}) {
      const id = randomUUID();
      await sql("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
      await sql(
        "update public.profiles set role_id = (select id from public.roles where code = $2), employee_id = $3 where id = $1",
        [id, roleCode, options.employeeId ?? null]
      );
      return id;
    },
    async close() {
      await pool.end();
      const cleanup = new pg.Client({ ...connection, database: "postgres" });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

/** First row of a result, failing loudly if there is none. */
export function one(rows: Row[]): Row {
  const [row] = rows;
  if (!row) throw new Error("Expected a row");
  return row;
}
