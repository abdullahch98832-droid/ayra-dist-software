// Verifies the Supabase project configured in .env.local:
//   1. URL + publishable key reach the API and Auth service.
//   2. Migrations are applied (tables exist and anonymous access is denied by design).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in .env.local");
  process.exit(1);
}

let ok = true;
const pass = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => { ok = false; console.error(`✗ ${msg}`); };

try {
  const res = await fetch(new URL("/auth/v1/health", url), { headers: { apikey: key } });
  if (res.ok) pass("Auth service reachable");
  else fail(`Auth service responded ${res.status} — check the URL and publishable key`);
} catch (error) {
  fail(`Cannot reach ${url}: ${error.message}`);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.from("app_settings").select("key").limit(1);
if (!error) {
  fail("Anonymous read of app_settings succeeded — RLS/grants are not applied correctly");
} else if (error.code === "42501") {
  pass("Database reachable, migrations applied, anonymous access denied");
} else if (error.code === "PGRST205" || error.code === "42P01") {
  fail("Database reachable but migrations are not applied — run: npx supabase db push");
} else {
  fail(`Unexpected database response: ${error.code ?? ""} ${error.message}`);
}

process.exit(ok ? 0 : 1);
