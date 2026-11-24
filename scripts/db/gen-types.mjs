// Generates src/types/database.ts from the migrations, in the same shape as
// `supabase gen types typescript`, using a throwaway local Postgres.
// Once a Supabase project is linked, `npm run db:types` (official CLI) can be used instead.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createMigratedDatabase, startLocalPostgres } from "./local-db.mjs";

const OUT = fileURLToPath(new URL("../../src/types/database.ts", import.meta.url));
const DB = "ayra_types";

const SCALARS = {
  bool: "boolean",
  int2: "number", int4: "number", int8: "number", float4: "number", float8: "number", numeric: "number",
  text: "string", varchar: "string", bpchar: "string", uuid: "string", date: "string", time: "string",
  timestamp: "string", timestamptz: "string", interval: "string", daterange: "string",
  json: "Json", jsonb: "Json",
};

// forWrite: numeric (money) also accepts an exact decimal string, so values never pass through a float.
function tsType(typname, enums, forWrite = false) {
  const isArray = typname.startsWith("_");
  const base = isArray ? typname.slice(1) : typname;
  const t = enums.has(base) ? `Database["public"]["Enums"]["${base}"]`
    : forWrite && base === "numeric" ? "number | string"
    : SCALARS[base] ?? "unknown";
  return isArray ? `${t}[]` : t;
}

const key = (name) => (/^[a-z_][a-z0-9_]*$/i.test(name) ? name : JSON.stringify(name));
const indent = (s, n) => s.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");

async function introspect(client) {
  const enumRows = (await client.query(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
     group by t.typname order by t.typname`)).rows;
  const enums = new Map(enumRows.map((r) => [r.name, r.labels]));

  const columns = (await client.query(`
    select c.relname as rel, c.relkind as kind, a.attname as name, t.typname as type,
           a.attnotnull as not_null, a.atthasdef as has_default, a.attidentity as identity, a.attgenerated as generated,
           has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT') as can_select,
           has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT') as can_insert,
           has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') as can_update
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
     where c.relkind in ('r', 'v')
     order by c.relname, a.attnum`)).rows;

  const fks = (await client.query(`
    select con.conname as name, src.relname as rel, dst.relname as ref,
           array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as cols,
           array(select a.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as ref_cols,
           exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique and i.indpred is null
                     and (i.indkey::int2[])::int2[] @> con.conkey and cardinality(i.indkey::int2[]) = cardinality(con.conkey)) as one_to_one
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class dst on dst.oid = con.confrelid
      join pg_namespace n on n.oid = src.relnamespace and n.nspname = 'public'
      join pg_namespace dn on dn.oid = dst.relnamespace and dn.nspname = 'public'
     where con.contype = 'f'
     order by src.relname, con.conname`)).rows;

  const functions = (await client.query(`
    select p.proname as name, p.proretset as returns_set, rt.typname as return_type, p.pronargdefaults as n_defaults,
           coalesce(p.proargnames, '{}') as arg_names, coalesce(p.proargmodes::text[], '{}') as arg_modes,
           array(select t.typname::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality a(oid, ord)
                   join pg_type t on t.oid = a.oid order by a.ord) as arg_types,
           p.pronargs as n_in
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      join pg_type rt on rt.oid = p.prorettype
     where rt.typname <> 'trigger'
     order by p.proname`)).rows;

  return { enums, columns, fks, functions };
}

function render({ enums, columns, fks, functions }) {
  const rels = new Map();
  for (const c of columns) {
    if (!rels.has(c.rel)) rels.set(c.rel, { kind: c.kind, cols: [] });
    rels.get(c.rel).cols.push(c);
  }

  const relBlock = (name, { kind, cols }) => {
    const isView = kind === "v";
    // Types describe what a signed-in client may do: hidden columns are omitted from Row,
    // system-managed columns from Insert/Update.
    const row = cols.filter((c) => c.can_select)
      .map((c) => `${key(c.name)}: ${tsType(c.type, enums)}${isView || !c.not_null ? " | null" : ""}`);
    const parts = [`Row: {\n${indent(row.join("\n"), 2)}\n}`];
    if (!isView) {
      const writable = (optionalAll, privilege) => cols.filter((c) => c[privilege]).map((c) => {
        const t = tsType(c.type, enums, true) + (c.not_null ? "" : " | null");
        const optional = optionalAll || !c.not_null || c.has_default || c.identity === "d";
        return `${key(c.name)}${optional ? "?" : ""}: ${t}`;
      });
      const block = (lines) => (lines.length ? `{\n${indent(lines.join("\n"), 2)}\n}` : "{ [key: string]: never }");
      parts.push(`Insert: ${block(writable(false, "can_insert"))}`);
      parts.push(`Update: ${block(writable(true, "can_update"))}`);
    }
    const relationships = isView ? [] : fks.filter((f) => f.rel === name).map((f) =>
      `{\n  foreignKeyName: ${JSON.stringify(f.name)}\n  columns: ${JSON.stringify(f.cols)}\n  isOneToOne: ${f.one_to_one}\n  referencedRelation: ${JSON.stringify(f.ref)}\n  referencedColumns: ${JSON.stringify(f.ref_cols)}\n}`);
    parts.push(relationships.length ? `Relationships: [\n${indent(relationships.join(",\n"), 2)}\n]` : "Relationships: []");
    return `${key(name)}: {\n${indent(parts.join("\n"), 2)}\n}`;
  };

  const tables = [...rels].filter(([, r]) => r.kind === "r").map(([n, r]) => relBlock(n, r));
  const views = [...rels].filter(([, r]) => r.kind === "v").map(([n, r]) => relBlock(n, r));

  const fnBlocks = functions.map((f) => {
    const inArgs = [];
    const outCols = [];
    f.arg_types.forEach((type, i) => {
      const mode = f.arg_modes[i] ?? "i";
      const name = f.arg_names[i] ?? `arg${i}`;
      if (mode === "i" || mode === "b") inArgs.push({ name, type });
      if (mode === "t" || mode === "o" || mode === "b") outCols.push({ name, type });
    });
    const firstDefault = inArgs.length - f.n_defaults;
    const args = inArgs.map((a, i) => `${key(a.name)}${i >= firstDefault ? "?" : ""}: ${tsType(a.type, enums, true)}`);
    let returns;
    if (outCols.length) {
      returns = `{\n${indent(outCols.map((c) => `${key(c.name)}: ${tsType(c.type, enums)}`).join("\n"), 2)}\n}${f.returns_set ? "[]" : ""}`;
    } else if (f.return_type === "void") {
      returns = "undefined";
    } else {
      returns = `${tsType(f.return_type, enums)}${f.returns_set ? "[]" : ""}`;
    }
    const argsBlock = args.length ? `{\n${indent(args.join("\n"), 2)}\n}` : "Record<PropertyKey, never>";
    return `${key(f.name)}: {\n  Args: ${argsBlock.replace(/\n/g, "\n  ")}\n  Returns: ${returns.replace(/\n/g, "\n  ")}\n}`;
  });

  const enumBlock = [...enums].map(([n, labels]) => `${key(n)}: ${labels.map((l) => JSON.stringify(l)).join(" | ")}`);

  const schema = [
    `Tables: {\n${indent(tables.join("\n"), 2)}\n}`,
    `Views: {\n${indent(views.join("\n"), 2)}\n}`,
    `Functions: {\n${indent(fnBlocks.join("\n"), 2)}\n}`,
    `Enums: {\n${indent(enumBlock.join("\n"), 2)}\n}`,
    "CompositeTypes: Record<string, never>",
  ].join("\n");

  return `// Generated by scripts/db/gen-types.mjs from supabase/migrations. Do not edit by hand.
// Regenerate with: npm run db:types
// Note: numeric (money) columns arrive as JSON numbers; convert with toPaisa() before any arithmetic.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
${indent(schema, 4)}
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"] | keyof PublicSchema["Views"]> =
  T extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][T]["Row"]
    : T extends keyof PublicSchema["Views"]
      ? PublicSchema["Views"][T]["Row"]
      : never;
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
${[...enums].map(([n, labels]) => `      ${key(n)}: ${JSON.stringify(labels)},`).join("\n")}
    },
  },
} as const;
`;
}

const { server, connection } = await startLocalPostgres();
try {
  await createMigratedDatabase(connection, DB);
  const client = new pg.Client({ ...connection, database: DB });
  await client.connect();
  try {
    await writeFile(OUT, render(await introspect(client)));
  } finally {
    await client.end();
  }
  console.log(`Wrote ${OUT}`);
} finally {
  await server.stop();
}
