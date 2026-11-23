import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification, NotificationResult } from "./types";

/** Conditions that need attention right now, read from live data. Each module adds its own source here. */
export async function getNotifications(ctx: SessionContext): Promise<NotificationResult> {
  try {
    const items: AppNotification[] = [];
    if (can(ctx, "users.manage")) {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("role_id", null)
        .is("removed_at", null)
        .eq("is_active", true);
      if (error) throw error;
      if (count) items.push({ id: "users-without-role", kind: "usersWithoutRole", count, href: "/admin/users" });
    }
    return { ok: true, items };
  } catch (error) {
    console.error(error);
    return { ok: false };
  }
}
