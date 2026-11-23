export type ActionErrorCode = "permissionDenied" | "validation" | "duplicate" | "notFound" | "rule" | "unexpected";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; code: ActionErrorCode; message?: string; fieldErrors?: Record<string, string[]> };
