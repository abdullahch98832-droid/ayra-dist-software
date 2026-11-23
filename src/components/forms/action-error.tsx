"use client";

import type { ActionResult } from "@/lib/action-result";
import { useI18n } from "@/i18n/context";
import { FormAlert } from "./field";

export function ActionError({ result }: { result: ActionResult<unknown> | null | undefined }) {
  const { t } = useI18n();
  if (!result || result.ok || result.code === "validation") return null;
  const text = result.code === "rule" || result.code === "notFound"
    ? `${t.errors[result.code]} ${result.message ?? ""}`.trim()
    : t.errors[result.code];
  return <FormAlert>{text}</FormAlert>;
}
