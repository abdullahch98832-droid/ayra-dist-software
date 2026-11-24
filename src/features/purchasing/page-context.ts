import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { isFlow } from "./flow";

/** What every procurement page needs: a valid workflow, the session and the language. */
export async function purchasingPage(params: Promise<{ flow: string; id?: string }>) {
  const { flow, id } = await params;
  if (!isFlow(flow) || (id !== undefined && !z.uuid().safeParse(id).success)) notFound();
  const [ctx, t, locale] = await Promise.all([requireActiveSession(), getT(), getLocale()]);
  const local = (en: string, ur: string | null | undefined) => (locale === "ur" && ur ? ur : en);
  return { flow, id: id ?? "", ctx, t, locale, local };
}
