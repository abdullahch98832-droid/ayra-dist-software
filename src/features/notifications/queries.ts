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
    const work = ["sales.approve", "sales.dispatch", "receivables.post", "sol.dispatch", "expenses.post"] as const;
    if (work.some((p) => can(ctx, p))) {
      const supabase = await createClient();
      // Counts only what this user may act on; the database applies their permissions.
      const { data, error } = await supabase.rpc("dashboard_open_work");
      if (error) throw error;
      const waiting = new Map(data.filter((r) => r.scope === "review").map((r) => [r.kind, Number(r.waiting)]));
      const add = (kind: AppNotification["kind"], source: string, href: string) => {
        const count = waiting.get(source);
        if (count) items.push({ id: source, kind, count, href });
      };
      add("ordersToApprove", "sales_order", "/sales/orders?status=submitted");
      add("ordersToDispatch", "dispatch", "/inventory/dispatch");
      add("paymentsToPost", "customer_payment", "/receivables/payments?status=draft");
      add("solDeliveries", "sol_delivery", "/sol/deliveries?status=draft");
      add("expensesToPost", "expense", "/expenses?status=draft");
      add("depositsToConfirm", "cash_deposit", "/receivables/cash?status=draft");
    }
    return { ok: true, items };
  } catch (error) {
    console.error(error);
    return { ok: false };
  }
}
