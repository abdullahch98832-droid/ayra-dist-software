import "server-only";
import { createClient } from "./server";

/** Short-lived signed URLs for files in a private bucket. */
export async function signedUrls(bucket: "employee-photos" | "product-images", paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  if (!wanted.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(wanted, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}
