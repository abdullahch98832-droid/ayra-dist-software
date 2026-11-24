import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";

/** Session and language for a page; checks the id when the route has one. */
export async function pageContext(params?: Promise<{ id: string }>) {
  const id = params ? (await params).id : "";
  if (params && !z.uuid().safeParse(id).success) notFound();
  const [ctx, t, locale] = await Promise.all([requireActiveSession(), getT(), getLocale()]);
  const local = (en: string, ur: string | null | undefined) => (locale === "ur" && ur ? ur : en);
  return { id, ctx, t, locale, local };
}

export const uuidParam = (value: string | string[] | undefined): string | null => {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
};
