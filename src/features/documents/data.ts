import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sumPaisa, toPaisa } from "@/lib/utils/money";

const amount = z.string().regex(/^-?\d+(\.\d{1,2})?$/);
const label = z.object({ en: z.string().nullable(), ur: z.string().nullable() }).nullable();
const party = z.object({
  code: z.string().nullish(), en: z.string(), ur: z.string().nullish(), principal: z.boolean().optional(), contact: z.string().nullish(), phone: z.string().nullish(), email: z.string().nullish(),
  address: z.string().nullish(), ntn: z.string().nullish(),
}).nullable();
const line = z.object({
  sku: z.string().nullish(), en: z.string().nullish(), ur: z.string().nullish(), note: z.string().nullish(), unit: label.optional(), quantity: z.number().optional(), expected: z.number().nullish(),
  damaged: z.number().optional(), rejected: z.number().optional(), returned: z.number().optional(), price: amount.optional(), discount: amount.optional(), tax: amount.optional(), tax_rate: z.string().optional(),
  total: amount.optional(), receipt: z.string().optional(), number: z.string().nullish(), doc_no: z.string().optional(), date: z.string().nullish(), invoice_total: amount.nullish(), amount: amount.optional(),
});
const payment = z.object({ number: z.string(), date: z.string(), method: z.string(), amount });

/** What the database says about a document. Amounts are exact decimal text; nothing is calculated here. */
export const documentSchema = z.object({
  number: z.string(), date: z.string(), status: z.string(), due_date: z.string().nullish(), notes: z.string().nullish(), party: party.optional(), warehouse: label.optional(), taker: label.optional(),
  damaged_warehouse: label.optional(), order: z.string().nullish(), delivery: z.string().nullish(), invoice: z.string().nullish(), expected_date: z.string().nullish(), reference: z.string().nullish(),
  invoice_number: z.string().optional(), receipts: z.array(z.string()).optional(), vehicle: z.string().nullish(), driver: label.optional(), supplier_man: label.nullish(), received_by: z.string().nullish(), delivery_note: z.string().nullish(),
  destination: z.string().nullish(), job: z.union([z.string(), z.object({ number: z.string(), contract: amount, paid: amount.optional(), outstanding: amount.optional() })]).nullish(),
  job_date: z.string().nullish(), completion_date: z.string().nullish(), description: z.string().nullish(), address: z.string().nullish(), contact: z.string().nullish(), contact_phone: z.string().nullish(),
  responsible: label.optional(), type: label.optional(), method: z.string().nullish(), payer_account: z.string().nullish(), void_reason: z.string().nullish(), account: z.string().nullish(), collector: label.optional(),
  recorded_by: z.string().nullish(), approved_by: z.string().nullish(), payee: z.string().nullish(), receipt: z.boolean().optional(), no_receipt_reason: z.string().nullish(), category: label.optional(),
  employee: z.object({ code: z.string(), en: z.string(), ur: z.string().nullable(), title: z.string().nullable(), advances: amount }).nullish(), balance: amount.nullish(),
  lines: z.array(line).optional(), payments: z.array(payment).optional(), totals: z.record(z.string(), amount).optional(),
});
export type DocumentData = z.infer<typeof documentSchema>;

export async function loadDocument(kind: string, id: string): Promise<DocumentData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_data", { p_kind: kind, p_id: id });
  if (error) throw error;
  return data === null ? null : documentSchema.parse(data);
}

export async function loadSalarySlips(runId: string): Promise<DocumentData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_data", { p_kind: "salary_slips", p_id: runId });
  if (error) throw error;
  return data === null ? [] : z.array(documentSchema).parse(data);
}

const statementSchema = z.object({
  party, from: z.string(), to: z.string(), opening: amount, totals: z.object({ debit: amount, credit: amount, closing: amount }),
  lines: z.array(z.object({ date: z.string(), type: z.string().nullable(), number: z.string().nullable(), description: z.string().nullable(), reversal: z.boolean().nullable(), debit: amount, credit: amount, balance: amount })),
});
export type StatementData = z.infer<typeof statementSchema>;

export async function loadStatementData(kind: "customer" | "supplier", partyId: string, from: string, to: string): Promise<StatementData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_statement", { p_kind: kind, p_party_id: partyId, p_from: from, p_to: to });
  if (error) throw error;
  return data === null ? null : statementSchema.parse(data);
}

export async function principalId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id").eq("is_principal", true).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** The lines of a document do not add up to its saved total. */
export class DocumentMismatch extends Error {}

/** Refuses a document whose saved lines and saved total disagree, instead of printing a wrong paper. */
export function assertAddsUp(doc: DocumentData) {
  const lines = sumPaisa((doc.lines ?? []).map((l) => toPaisa(l.total ?? "0")));
  if (lines !== toPaisa(doc.totals?.lines ?? "0") || lines !== toPaisa(doc.totals?.total ?? "0")) throw new DocumentMismatch(`${doc.number}: lines and total differ`);
}

export function assertStatement(s: StatementData, sign: 1 | -1) {
  let balance = toPaisa(s.opening);
  for (const l of s.lines) {
    balance += sign === 1 ? toPaisa(l.debit) - toPaisa(l.credit) : toPaisa(l.credit) - toPaisa(l.debit);
    if (balance !== toPaisa(l.balance)) throw new DocumentMismatch("Running balance differs");
  }
  if (balance !== toPaisa(s.totals.closing)) throw new DocumentMismatch("Closing balance differs");
}

const SETTINGS = ["company_name", "company_name_ur", "company_address", "company_address_ur", "company_phone", "company_email", "company_ntn", "document_note", "document_note_ur"] as const;
export type DocumentSettings = Record<(typeof SETTINGS)[number], string>;

export async function loadDocumentSettings(): Promise<DocumentSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("key, value").in("key", [...SETTINGS]);
  if (error) throw error;
  const values = new Map(data.map((s) => [s.key, typeof s.value === "string" ? s.value : ""]));
  return Object.fromEntries(SETTINGS.map((k) => [k, values.get(k) ?? ""])) as DocumentSettings;
}
