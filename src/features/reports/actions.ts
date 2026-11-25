"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError, validationError } from "@/lib/actions";
import { authorizeAny } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ name: z.string().trim().min(1).max(60) });

/** Asked before a list on the screen is saved as a file: checks the permission, and the export is recorded. */
export async function allowListExportAction(name: string): Promise<ActionResult<null>> {
  try {
    await authorizeAny(["reports.export"]);
    const parsed = schema.safeParse({ name: name.slice(0, 60) });
    if (!parsed.success) return validationError(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("record_report_export", { p_report: parsed.data.name, p_format: "csv", p_filters: {} });
    if (error) throw error;
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
