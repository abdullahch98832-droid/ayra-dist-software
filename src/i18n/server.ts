import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "@/types";
import { LOCALE_COOKIE, parseLocale } from "./config";
import { getDictionary, type Dictionary } from "./index";

export async function getLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
