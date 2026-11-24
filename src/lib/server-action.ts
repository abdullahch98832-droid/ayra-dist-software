import "server-only";
import type { z } from "zod";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { toActionError, validationError } from "@/lib/actions";
import { AuthorizationError, can, getSessionContext, type SessionContext } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

/** Verifies the caller holds at least one of the permissions. The database checks again. */
export async function authorizeAny(permissions: readonly Permission[]): Promise<SessionContext> {
  const ctx = await getSessionContext();
  const [first] = permissions;
  if (!ctx || !first || !permissions.some((p) => can(ctx, p))) throw new AuthorizationError(first ?? "dashboard.view");
  return ctx;
}

/** Authorize, validate, run, refresh: the shape of every mutating server action. */
export async function runAction<S extends z.ZodType, T>(
  permissions: Permission | readonly Permission[],
  schema: S,
  input: unknown,
  work: (values: z.output<S>, ctx: SessionContext) => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const ctx = await authorizeAny(typeof permissions === "string" ? [permissions] : permissions);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const data = await work(parsed.data, ctx);
    refresh();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}
