import { getT } from "@/i18n/server";

/** Wraps skeletons so screen readers hear one "loading" message instead of empty boxes. */
export async function LoadingRegion({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t.common.loading}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}
