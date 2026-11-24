import { sourceHref, sourceLabel, type LedgerLine } from "@/features/accounting/queries";
import type { Dictionary } from "@/i18n";
import { SpecTable } from "@/components/tables/spec-table";

/** Lines of one ledger account with its running balance: general ledger, cash book and bank book. */
export function LedgerTable({ t, local, lines, caption, exportName, debitLabel, creditLabel, canOpen, toolbar }: {
  t: Dictionary;
  local: (en: string, ur: string | null | undefined) => string;
  lines: LedgerLine[];
  caption: string;
  exportName: string;
  debitLabel: string;
  creditLabel: string;
  /** Whether the reader may open journal entries. */
  canOpen: boolean;
  toolbar?: React.ReactNode;
}) {
  const a = t.accounting;
  return (
    <SpecTable
      caption={caption}
      exportName={exportName}
      rows={lines.map((l, i) => ({
        id: `${l.entry_id ?? "opening"}-${i}`, date: l.entry_date, entry: l.doc_no, entryHref: canOpen && l.entry_id ? `/accounting/journal/${l.entry_id}` : undefined, kind: l.is_reversal ? a.reversal : null,
        doc: l.source_type === "brought_forward" ? a.broughtForward : l.source_no ?? sourceLabel(t, l.source_type), docHref: sourceHref(l.source_type, l.source_id), docKind: l.source_no ? sourceLabel(t, l.source_type) : null,
        party: l.party ? local(l.party, l.party_ur) : null, description: l.description, debit: l.source_type === "brought_forward" || l.debit === 0 ? null : l.debit, credit: l.source_type === "brought_forward" || l.credit === 0 ? null : l.credit, balance: l.balance,
      }))}
      columns={[
        { key: "date", label: a.date, kind: "date" }, { key: "doc", sub: "docKind", label: a.document, kind: "link", primary: true }, { key: "party", label: a.party, kind: "text", hideBelow: "lg" }, { key: "description", label: a.description, kind: "text", hideBelow: "2xl" },
        { key: "entry", sub: "kind", label: a.entry, kind: "link", hideBelow: "xl" }, { key: "debit", label: debitLabel, kind: "money", total: true }, { key: "credit", label: creditLabel, kind: "money", total: true }, { key: "balance", label: a.balance, kind: "money" },
      ]}
      searchKeys={["doc", "docKind", "party", "entry", "description"]}
      pageSize={50}
      toolbar={toolbar}
      empty={{ title: a.ledgerEmpty }}
    />
  );
}
