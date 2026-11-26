import { toPaisa } from "@/lib/utils/money";
import { Money } from "@/components/shared/bidi";
import type { Locale } from "@/types";

type Contributor = { name: string; amount: string | number };

export function ContributorsList({ contributors, locale }: { contributors: unknown; locale: Locale }) {
  if (!Array.isArray(contributors) || contributors.length === 0) return null;
  const rows = contributors as Contributor[];
  return (
    <ul className="grid gap-1">
      {rows.map((c, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">{c.name}</span>
          <Money amount={toPaisa(String(c.amount))} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
