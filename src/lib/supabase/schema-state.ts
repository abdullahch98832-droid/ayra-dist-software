import "server-only";
import { REQUIRED_VERSION } from "@/config/database";
import { createClient } from "./server";

// A database never goes back to an older version, so one positive answer is enough for this process.
let upToDate = false;

/** True when the newest migration has not been applied, so pages using it cannot load. */
export async function databaseUpdateNeeded(): Promise<boolean> {
  if (upToDate) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "schema_version").maybeSingle();
  if (error) {
    console.error(error);
    return false; // unknown: the page itself reports what is wrong
  }
  // Versions are timestamps of equal length, so text order is date order.
  upToDate = typeof data?.value === "string" && data.value >= REQUIRED_VERSION;
  return !upToDate;
}
