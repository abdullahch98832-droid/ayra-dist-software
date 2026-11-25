"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { documentSettingsSchema, type DocumentSettingsValues } from "./schema";

export async function setNegativeStockAction(enabled: boolean): Promise<ActionResult<null>> {
  return runAction("settings.manage", z.boolean(), enabled, async (value) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings").update({ value }).eq("key", "allow_negative_stock").select("key");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The setting was not found"), { code: "P0002" });
    return null;
  });
}

export async function saveDocumentSettingsAction(values: DocumentSettingsValues): Promise<ActionResult<null>> {
  return runAction("settings.manage", documentSettingsSchema, values, async (doc) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_document_settings", { p_doc: doc });
    if (error) throw error;
    return null;
  });
}
