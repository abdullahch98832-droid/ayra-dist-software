import "server-only";
import type { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

interface PostgresLikeError {
  code?: string;
  message?: string;
}

/** Maps errors to a safe result. Business-rule messages from the database are passed through. */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof AuthorizationError) return { ok: false, code: "permissionDenied" };
  const e = (error ?? {}) as PostgresLikeError;
  switch (e.code) {
    case "42501":
      return { ok: false, code: "permissionDenied" };
    case "23505":
      return { ok: false, code: "duplicate" };
    case "P0002":
      return { ok: false, code: "notFound", message: e.message };
    case "23514":
    case "22023":
    case "23503":
    case "P0001":
      return { ok: false, code: "rule", message: e.message };
    default:
      console.error(error);
      return { ok: false, code: "unexpected" };
  }
}

export function validationError(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, code: "validation", fieldErrors };
}
