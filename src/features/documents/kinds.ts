import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";

export type DocumentKind = keyof Dictionary["docs"]["kinds"];

interface KindDefinition {
  /** One saved document, one party over a period, a period, or a moment. */
  needs: "id" | "party" | "period" | "asOf" | "report";
  /** Any one of these opens it; the database checks again. Documents without this rely on row security alone. */
  permissions?: readonly Permission[];
}

/** Every document the system prints. The address uses hyphens: /documents/sales-invoice?id=… */
export const DOCUMENT_KINDS: Record<DocumentKind, KindDefinition> = {
  sales_invoice: { needs: "id" },
  purchase_invoice: { needs: "id" },
  purchase_order: { needs: "id" },
  goods_receipt: { needs: "id" },
  delivery_challan: { needs: "id" },
  sol_challan: { needs: "id" },
  customer_receipt: { needs: "id" },
  supplier_receipt: { needs: "id" },
  sol_invoice: { needs: "id" },
  sol_receipt: { needs: "id" },
  expense_voucher: { needs: "id" },
  supplier_return: { needs: "id" },
  company_money: { needs: "id", permissions: ["company.view"] },
  cash_voucher: { needs: "id", permissions: ["cash_bank.view", "accounting.view"] },
  cash_deposit: { needs: "id" },
  salary_slip: { needs: "id", permissions: ["payroll.view"] },
  salary_slips: { needs: "id", permissions: ["payroll.view"] },
  customer_statement: { needs: "party", permissions: ["receivables.view"] },
  supplier_statement: { needs: "party", permissions: ["payables.view"] },
  company_statement: { needs: "period", permissions: ["company.view"] },
  // Which report, and who may export it, is decided by loadReport().
  report: { needs: "report", permissions: ["reports.export"] },
  trial_balance: { needs: "period", permissions: ["reports.financial"] },
  profit_and_loss: { needs: "period", permissions: ["reports.financial"] },
  balance_sheet: { needs: "asOf", permissions: ["reports.financial"] },
  cash_flow: { needs: "period", permissions: ["reports.financial"] },
  general_ledger: { needs: "party", permissions: ["accounting.view"] },
  cash_book: { needs: "party", permissions: ["cash_bank.view", "accounting.view"] },
  bank_book: { needs: "party", permissions: ["cash_bank.view", "accounting.view"] },
};

export const kindSlug = (kind: DocumentKind) => kind.replaceAll("_", "-");
export function kindOfSlug(slug: string): DocumentKind | null {
  const kind = slug.replaceAll("-", "_");
  return slug === slug.toLowerCase() && kind in DOCUMENT_KINDS ? (kind as DocumentKind) : null;
}

/** Address of the preview of a document. */
export function documentHref(kind: DocumentKind, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  return `/documents/${kindSlug(kind)}${query.size ? `?${query}` : ""}`;
}
