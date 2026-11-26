import "server-only";
import type { Dictionary } from "@/i18n";
import type { Bi, Block, Cell, Column, DocModel } from "@/lib/pdf/model";
import { toPaisa } from "@/lib/utils/money";
import { assertAddsUp, DocumentMismatch, type DocumentData, type DocumentSettings } from "./data";
import { bi, biKey, code, date, dateBi, figure, figureOrDash, isZero, name, quantity, rupees, text } from "./format";
import type { DocumentKind } from "./kinds";

type Meta = DocModel["meta"];
type Totals = Extract<Block, { type: "totals" }>["rows"];

const title = (kind: DocumentKind): Bi => bi((t) => t.docs.kinds[kind]);
const L = (key: keyof Dictionary["docs"]["labels"]) => bi((t) => t.docs.labels[key]);
const T = (key: keyof Dictionary["docs"]["totals"]) => bi((t) => t.docs.totals[key]);
const S = (...keys: (keyof Dictionary["docs"]["signatures"])[]) => keys.map((key) => bi((t) => t.docs.signatures[key]));
const method = (value: string | null | undefined): Cell => (value ? { text: biKey((t) => t.purchasing.methods, value) } : text(null));
const named = (x: { en: string | null; ur: string | null } | null | undefined): Cell => (x?.en ? text(name(x.en, x.ur)) : text(null));
/** Rows of the details that have something to say. */
const meta = (...rows: (Meta[number] | false | null | undefined)[]): Meta => rows.filter((r): r is Meta[number] => !!r && r.value.text !== "—");
const total = (label: Bi, amount: string | undefined, extra: { strong?: boolean; line?: boolean; show?: boolean; cell?: Partial<Cell> } = {}): Totals =>
  (amount === undefined || extra.show === false ? [] : [{ label, value: rupees(amount, extra.cell), strong: extra.strong, line: extra.line }]);
const owed = (amount: string | undefined): Partial<Cell> => (amount && toPaisa(amount) > BigInt(0) ? { tone: "danger" } : {});

/** What a paper in this state must say across the page. */
function mark(status: string): Bi | undefined {
  const marks = { draft: "draft", submitted: "draft", void: "void", cancelled: "cancelled", rejected: "rejected" } as const;
  const key = marks[status as keyof typeof marks];
  return key ? bi((t) => t.docs.marks[key]) : undefined;
}

function partyOf(doc: DocumentData, label: Bi): DocModel["party"] {
  const p = doc.party;
  if (!p) return undefined;
  const line = (value: string | null | undefined, extra: Partial<Cell> = {}): Cell[] => (value ? [{ text: value, ...extra }] : []);
  return {
    label, name: name(p.en, p.ur),
    lines: [...line(p.contact), ...line(p.address), ...line([p.phone, p.email].filter(Boolean).join("  ·  "), { code: true }), ...(p.ntn ? [{ text: `NTN: ${p.ntn}`, code: true } satisfies Cell] : []),
      ...(p.code ? [{ text: p.code, code: true, tone: "muted" } satisfies Cell] : [])],
  };
}

const product = (l: { sku?: string | null; en?: string | null; ur?: string | null; note?: string | null }): Cell => ({ text: name(l.en ?? "—", l.ur), sub: [l.sku, l.note].filter(Boolean).join(" · ") || undefined, strong: true });
const unit = (l: { unit?: { en: string | null; ur: string | null } | null }): Cell => named(l.unit);

function paymentsTable(doc: DocumentData): Block[] {
  if (!doc.payments?.length) return [];
  return [{
    type: "table", title: L("payments"),
    columns: [{ label: L("number"), flex: 1 }, { label: L("date") }, { label: L("method"), flex: 1 }, { label: L("amount"), figure: true }],
    rows: doc.payments.map((p) => [code(p.number), date(p.date), method(p.method), figure(p.amount)]),
  }];
}

/** Who paid or received, and how much each; only when more than one person did. */
function peopleTable(doc: DocumentData): Block[] {
  if (!doc.people?.length) return [];
  return [{
    type: "table", title: L("paidBy"), columns: [{ label: L("person"), flex: 1 }, { label: L("amount"), figure: true }],
    rows: doc.people.map((p) => [text(p.name), figure(p.amount)]),
  }];
}
/** The one account, unless more than one person paid: then each share's account is in the "Paid by" table. */
const oneAccount = (doc: DocumentData): Cell => text(doc.people?.length ? null : doc.account);
const direction = (doc: DocumentData): Cell => (doc.direction ? { text: L(doc.direction === "in" ? "moneyIn" : "moneyOut") } : text(null));
const status = (doc: DocumentData): Cell => ({ text: biKey((t) => t.purchasing.statuses, doc.status) });

const notes = (doc: DocumentData): Block[] => (doc.notes ? [{ type: "text", title: L("notes"), text: doc.notes }] : []);
const invoiceNote = (settings: DocumentSettings) => ({ en: settings.document_note, ur: settings.document_note_ur });

function salesInvoice(doc: DocumentData, settings: DocumentSettings): DocModel {
  assertAddsUp(doc);
  const lines = doc.lines ?? [];
  const t = doc.totals ?? {};
  const discounts = !isZero(t.discount);
  const taxes = !isZero(t.tax);
  const columns: Column[] = [
    { label: L("product"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, { label: L("price"), figure: true },
    ...(discounts ? [{ label: L("discount"), figure: true }] : []), ...(taxes ? [{ label: L("tax"), figure: true }] : []), { label: L("total"), figure: true },
  ];
  return {
    title: title("sales_invoice"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, L("customer")),
    meta: meta(
      { label: L("invoiceDate"), value: date(doc.date) }, { label: L("dueDate"), value: date(doc.due_date) }, { label: L("order"), value: code(doc.order) }, { label: L("delivery"), value: code(doc.delivery) },
      { label: L("orderTaker"), value: named(doc.taker) }, { label: L("warehouse"), value: named(doc.warehouse) },
    ),
    blocks: [
      { type: "table", numbered: true, columns, rows: lines.map((l) => [product(l), quantity(l.quantity), unit(l), figure(l.price), ...(discounts ? [figureOrDash(l.discount)] : []), ...(taxes ? [figureOrDash(l.tax)] : []), figure(l.total)]) },
      {
        type: "totals", rows: [
          ...total(T("gross"), t.gross, { show: discounts || taxes }), ...total(T("discount"), discounts ? `-${t.discount}` : undefined, { cell: { tone: undefined } }), ...total(T("net"), t.net, { show: taxes, line: true }), ...total(T("tax"), t.tax, { show: taxes }),
          ...total(T("total"), t.total, { strong: true }), ...total(T("returned"), t.returned, { show: !isZero(t.returned) }), ...total(T("credited"), t.credited, { show: !isZero(t.credited) }),
          ...total(T("paid"), t.paid), ...total(T("outstanding"), t.outstanding, { strong: true, cell: owed(t.outstanding) }), ...total(T("balance"), doc.balance ?? undefined, { line: true }),
        ],
      },
      ...paymentsTable(doc), ...notes(doc),
    ],
    signatures: S("prepared", "customer", "authorised"), note: invoiceNote(settings),
  };
}

function purchaseOrder(doc: DocumentData): DocModel {
  assertAddsUp(doc);
  return {
    title: title("purchase_order"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, doc.party?.principal ? L("company") : L("supplier")),
    meta: meta({ label: L("date"), value: date(doc.date) }, { label: L("expectedDate"), value: date(doc.expected_date) }, { label: L("warehouse"), value: named(doc.warehouse) },
      { label: L("status"), value: { text: biKey((t) => t.purchasing.statuses, doc.status) } }),
    blocks: [
      { type: "table", numbered: true, columns: [{ label: L("product"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, { label: L("price"), figure: true }, { label: L("total"), figure: true }],
        rows: (doc.lines ?? []).map((l) => [product(l), quantity(l.quantity), unit(l), figure(l.price), figure(l.total)]) },
      { type: "totals", rows: total(T("total"), doc.totals?.total, { strong: true }) }, ...notes(doc),
    ],
    signatures: S("prepared", "approved", "supplier"),
  };
}

function goodsReceipt(doc: DocumentData): DocModel {
  assertAddsUp(doc);
  const lines = doc.lines ?? [];
  const some = (key: "expected" | "damaged" | "rejected") => lines.some((l) => (l[key] ?? 0) > 0);
  const [expected, damaged, rejected] = [some("expected"), some("damaged"), some("rejected")];
  const columns: Column[] = [
    { label: L("product"), flex: 1 }, { label: L("unit") }, ...(expected ? [{ label: L("ordered"), figure: true }] : []), { label: L("accepted"), figure: true }, ...(damaged ? [{ label: L("damaged"), figure: true }] : []),
    ...(rejected ? [{ label: L("rejected"), figure: true }] : []), { label: L("cost"), figure: true }, { label: L("total"), figure: true },
  ];
  return {
    title: title("goods_receipt"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, doc.party?.principal ? L("company") : L("supplier")),
    meta: meta({ label: L("date"), value: date(doc.date) }, { label: L("order"), value: code(doc.order) }, { label: L("reference"), value: code(doc.reference) }, { label: L("warehouse"), value: named(doc.warehouse) },
      damaged && { label: L("damagedWarehouse"), value: named(doc.damaged_warehouse) }),
    blocks: [
      { type: "table", numbered: true, columns, rows: lines.map((l) => [product(l), unit(l), ...(expected ? [quantity(l.expected)] : []), quantity(l.quantity), ...(damaged ? [quantity(l.damaged)] : []), ...(rejected ? [quantity(l.rejected)] : []), figure(l.price), figure(l.total)]) },
      { type: "totals", rows: total(T("total"), doc.totals?.total, { strong: true }) }, ...notes(doc),
    ],
    signatures: S("receiver", "checked", "supplier"),
  };
}

function purchaseInvoice(doc: DocumentData): DocModel {
  const t = doc.totals ?? {};
  // A bill may differ from its receipts; the difference is stated, so the parts always make the whole.
  const parts = toPaisa(t.lines ?? "0") + toPaisa(t.difference ?? "0");
  if (parts !== toPaisa(t.total ?? "0")) throw new DocumentMismatch(`${doc.number}: receipts and total differ`);
  return {
    title: title("purchase_invoice"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, doc.party?.principal ? L("company") : L("supplier")),
    meta: meta({ label: L("supplierInvoice"), value: code(doc.invoice_number) }, { label: L("invoiceDate"), value: date(doc.date) }, { label: L("dueDate"), value: date(doc.due_date) }, { label: L("receipts"), value: code((doc.receipts ?? []).join(", ")) }),
    blocks: [
      { type: "table", numbered: true, columns: [{ label: L("product"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, { label: L("price"), figure: true }, { label: L("total"), figure: true }],
        rows: (doc.lines ?? []).map((l) => [{ ...product(l), sub: [l.sku, l.receipt].filter(Boolean).join(" · ") }, quantity(l.quantity), unit(l), figure(l.price), figure(l.total)]), empty: bi((x) => x.docs.empty) },
      { type: "totals", rows: [
        ...total(T("goods"), t.lines, { show: !isZero(t.difference) }), ...total(T("difference"), t.difference, { show: !isZero(t.difference) }), ...total(T("total"), t.total, { strong: true }),
        ...total(T("paid"), t.paid), ...total(T("outstanding"), t.outstanding, { strong: true, cell: owed(t.outstanding) }),
      ] },
      ...paymentsTable(doc), ...notes(doc),
    ],
    signatures: S("prepared", "checked", "authorised"),
  };
}

function challan(doc: DocumentData, kind: "delivery_challan" | "sol_challan"): DocModel {
  const lines = doc.lines ?? [];
  const returned = lines.some((l) => (l.returned ?? 0) > 0);
  return {
    title: title(kind), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, kind === "sol_challan" ? L("client") : L("customer")),
    meta: meta({ label: L("deliveryDate"), value: date(doc.date) }, { label: L("order"), value: code(doc.order) }, { label: L("invoice"), value: code(doc.invoice) }, { label: L("job"), value: code(typeof doc.job === "string" ? doc.job : null) },
      { label: L("vehicle"), value: code(doc.vehicle) }, { label: L("supplierMan"), value: named(doc.supplier_man ?? undefined) }, { label: L("driver"), value: named(doc.driver) }, { label: L("destination"), value: text(doc.destination) }, { label: L("warehouse"), value: named(doc.warehouse) },
      { label: L("receivedBy"), value: text(doc.received_by) }),
    blocks: [
      { type: "table", numbered: true, columns: [{ label: L("product"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, ...(returned ? [{ label: L("returned"), figure: true }] : [])],
        rows: lines.map((l) => [product(l), quantity(l.quantity), unit(l), ...(returned ? [quantity(l.returned)] : [])]), empty: bi((x) => x.docs.empty) },
      ...(doc.delivery_note ? [{ type: "text", title: L("notes"), text: doc.delivery_note } satisfies Block] : notes(doc)),
    ],
    signatures: kind === "delivery_challan" && doc.supplier_man?.en ? S("warehouse", "supplierMan", "receiver") : S("warehouse", "driver", "receiver"),
  };
}

function solInvoice(doc: DocumentData, settings: DocumentSettings): DocModel {
  const t = doc.totals ?? {};
  const lines = doc.lines ?? [];
  const adjusted = lines.length > 0 && !isZero(t.difference);
  return {
    title: title("sol_invoice"), number: doc.number, watermark: doc.status === "completed" ? undefined : mark(doc.status) ?? bi((x) => x.docs.marks.open), party: partyOf(doc, L("client")),
    meta: meta({ label: L("jobDate"), value: date(doc.job_date) }, { label: L("completed"), value: date(doc.completion_date) }, { label: L("dueDate"), value: date(doc.due_date) }, { label: L("type"), value: named(doc.type) },
      { label: L("contact"), value: text(doc.contact) }, { label: L("phone"), value: code(doc.contact_phone) }, { label: L("responsible"), value: named(doc.responsible) }),
    blocks: [
      ...(doc.description || doc.address ? [{ type: "text", title: L("description"), text: [doc.description, doc.address].filter(Boolean).join("\n") } satisfies Block] : []),
      ...(lines.length ? [{
        type: "table", numbered: true, columns: [{ label: L("item"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, { label: L("price"), figure: true }, { label: L("total"), figure: true }],
        rows: lines.map((l) => [product(l), quantity(l.quantity), unit(l), figure(l.price), figure(l.total)]),
      } satisfies Block] : []),
      { type: "totals", rows: [
        ...total(T("items"), t.lines, { show: adjusted }), ...total(T("adjustment"), t.difference, { show: adjusted }), ...total(T("contract"), t.total, { strong: true }),
        ...total(T("paid"), t.paid), ...total(T("outstanding"), t.outstanding, { strong: true, cell: owed(t.outstanding) }),
      ] },
      ...paymentsTable(doc), ...notes(doc),
    ],
    signatures: S("prepared", "customer", "authorised"), note: invoiceNote(settings),
  };
}

function customerReceipt(doc: DocumentData, kind: "customer_receipt" | "sol_receipt"): DocModel {
  const t = doc.totals ?? {};
  const job = typeof doc.job === "object" ? doc.job : null;
  return {
    title: title(kind), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, kind === "sol_receipt" ? L("client") : L("customer")),
    meta: meta({ label: L("date"), value: date(doc.date) }, { label: L("method"), value: method(doc.method) }, { label: L("reference"), value: code(doc.reference) }, { label: L("payerAccount"), value: code(doc.payer_account) },
      { label: L("account"), value: oneAccount(doc) }, { label: L("collector"), value: named(doc.collector) }, { label: L("job"), value: code(job?.number) }, { label: L("recordedBy"), value: text(doc.recorded_by) }, { label: L("reason"), value: text(doc.void_reason) }),
    blocks: [
      { type: "totals", rows: total(T("received"), t.total, { strong: true }) },
      ...(doc.lines?.length ? [{
        type: "table", title: L("settles"), columns: [{ label: L("invoice"), flex: 1 }, { label: L("date") }, { label: L("invoiceTotal"), figure: true }, { label: L("settled"), figure: true }],
        rows: doc.lines.map((l) => [code(l.number), date(l.date), figure(l.invoice_total), figure(l.amount)]),
      } satisfies Block] : []),
      { type: "totals", rows: [
        ...total(T("allocated"), t.allocated, { show: !isZero(t.allocated) }), ...total(T("unallocated"), t.unallocated, { show: !isZero(t.unallocated) }),
        ...total(T("contract"), job?.contract, { line: true }), ...total(T("paid"), job?.paid), ...total(T("outstanding"), job?.outstanding, { cell: owed(job?.outstanding) }), ...total(T("balance"), doc.balance ?? undefined, { line: true }),
      ] },
      ...peopleTable(doc),
      ...notes(doc),
    ],
    signatures: S("cashier", "customer", "authorised"),
  };
}

function supplierReceipt(doc: DocumentData): DocModel {
  const t = doc.totals ?? {};
  return {
    title: title("supplier_receipt"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, doc.party?.principal ? L("company") : L("supplier")),
    meta: meta({ label: L("date"), value: date(doc.date) }, { label: L("method"), value: method(doc.method) }, { label: L("reference"), value: code(doc.reference) }, { label: L("account"), value: oneAccount(doc) }, { label: L("recordedBy"), value: text(doc.recorded_by) }),
    blocks: [
      { type: "totals", rows: total(T("paidAmount"), t.total, { strong: true }) },
      ...(doc.lines?.length ? [{
        type: "table", title: L("settles"), columns: [{ label: L("supplierInvoice"), flex: 1 }, { label: L("number"), flex: 1 }, { label: L("date") }, { label: L("invoiceTotal"), figure: true }, { label: L("settled"), figure: true }],
        rows: doc.lines.map((l) => [code(l.number), code(l.doc_no), date(l.date), figure(l.invoice_total), figure(l.amount)]),
      } satisfies Block] : []),
      { type: "totals", rows: [...total(T("allocated"), t.allocated, { show: !isZero(t.allocated) }), ...total(T("unallocated"), t.unallocated, { show: !isZero(t.unallocated) }), ...total(T("supplierBalance"), doc.balance ?? undefined, { line: true })] },
      ...peopleTable(doc),
      ...notes(doc),
    ],
    signatures: S("prepared", "authorised", "supplier"),
  };
}

function expenseVoucher(doc: DocumentData): DocModel {
  return {
    title: title("expense_voucher"), number: doc.number, watermark: mark(doc.status),
    meta: [],
    blocks: [
      { type: "fields", rows: [
        { label: L("date"), value: date(doc.date) }, { label: L("category"), value: named(doc.category) }, { label: L("payee"), value: text(doc.payee) }, { label: L("description"), value: text(doc.description) },
        { label: L("method"), value: method(doc.method) }, ...meta({ label: L("account"), value: oneAccount(doc) }),
        ...meta({ label: L("reference"), value: code(doc.reference) }, { label: L("vehicle"), value: code(doc.vehicle) }, { label: L("job"), value: code(typeof doc.job === "string" ? doc.job : null) }),
        { label: L("receiptAttached"), value: doc.receipt ? { text: L("attached") } : text(doc.no_receipt_reason ?? L("noReceipt")) },
        { label: L("recordedBy"), value: text(doc.recorded_by) }, { label: L("approvedBy"), value: text(doc.approved_by) }, { label: L("status"), value: { text: biKey((t) => ({ ...t.purchasing.statuses, rejected: t.docs.marks.rejected }), doc.status) } },
        ...meta({ label: L("reason"), value: text(doc.void_reason) }),
      ] },
      { type: "totals", rows: total(T("total"), doc.totals?.total, { strong: true }) },
      ...peopleTable(doc),
    ],
    signatures: S("prepared", "approved", "payee"),
  };
}

function supplierReturn(doc: DocumentData): DocModel {
  assertAddsUp(doc);
  return {
    title: title("supplier_return"), number: doc.number, watermark: mark(doc.status), party: partyOf(doc, doc.party?.principal ? L("company") : L("supplier")),
    meta: meta({ label: L("date"), value: date(doc.date) }, { label: L("warehouse"), value: named(doc.warehouse) }, { label: L("receipts"), value: code(doc.receipts?.join(", ") || null) },
      { label: L("status"), value: status(doc) }, { label: L("recordedBy"), value: text(doc.recorded_by) }),
    blocks: [
      { type: "table", numbered: true, columns: [{ label: L("product"), flex: 1 }, { label: L("quantity"), figure: true }, { label: L("unit") }, { label: L("price"), figure: true }, { label: L("total"), figure: true }],
        rows: (doc.lines ?? []).map((l) => [product(l), quantity(l.quantity), unit(l), figure(l.price), figure(l.total)]) },
      { type: "totals", rows: total(T("credited"), doc.totals?.total, { strong: true }) },
      ...(doc.notes ? [{ type: "text", title: L("reason"), text: doc.notes } satisfies Block] : []),
    ],
    signatures: S("prepared", "warehouse", "supplier"),
  };
}

/** One money voucher: company money, a cash or bank voucher, or cash handed in by an order taker. */
function moneyVoucher(doc: DocumentData, kind: "company_money" | "cash_voucher" | "cash_deposit"): DocModel {
  const countsAs = kind === "company_money" && doc.type_key && doc.direction === "out" ? { text: biKey((t) => t.supply.extra.kinds, doc.type_key) } : text(null);
  return {
    title: title(kind), number: doc.number, watermark: mark(doc.status),
    meta: [],
    blocks: [
      { type: "fields", rows: [
        { label: L("date"), value: date(doc.date) },
        ...meta({ label: L("direction"), value: direction(doc) }, { label: L("countsAs"), value: countsAs }, { label: L("orderTaker"), value: named(doc.taker) }),
        ...meta({ label: L("description"), value: text(doc.description) }, { label: L("party"), value: text(doc.payee) }, { label: L("counterAccount"), value: named(doc.category) }),
        ...meta({ label: L("account"), value: oneAccount(doc) }),
        ...meta({ label: L("method"), value: method(doc.method) }, { label: L("reference"), value: code(doc.reference) }, { label: L("notes"), value: text(doc.notes) }),
        { label: L("recordedBy"), value: text(doc.recorded_by) }, ...meta({ label: L("approvedBy"), value: text(doc.approved_by) }),
        { label: L("status"), value: status(doc) }, ...meta({ label: L("reason"), value: text(doc.void_reason) }),
      ] },
      { type: "totals", rows: total(T("total"), doc.totals?.total, { strong: true }) },
      ...peopleTable(doc),
    ],
    signatures: kind === "cash_deposit" ? S("cashier", "authorised") : S("prepared", "authorised", "receiver"),
  };
}

const MONTH = (iso: string): Bi => {
  const of = (locale: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", numberingSystem: "latn", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return { en: of("en-PK"), ur: of("ur-PK") };
};

function salarySlip(doc: DocumentData): DocModel {
  const t = doc.totals ?? {};
  const e = doc.employee;
  const of = (k: string) => toPaisa(t[k] ?? "0");
  if (of("basic") + of("allowances") + of("bonus") !== of("gross") || of("gross") - of("deductions") - of("recovery") !== of("total")) throw new DocumentMismatch(`${doc.number}: salary parts and net differ`);
  const earn: [Bi, string | undefined][] = [[T("basic"), t.basic], [T("allowances"), t.allowances], [T("bonus"), t.bonus]];
  const cut: [Bi, string | undefined][] = [[T("deductions"), t.deductions], [T("recovery"), t.recovery]];
  const rows = (list: [Bi, string | undefined][]) => list.map(([label, amount]) => ({ label, value: rupees(amount ?? "0") }));
  return {
    title: title("salary_slip"), number: doc.number, period: MONTH(doc.date), watermark: mark(doc.status),
    party: e ? { label: L("employee"), name: name(e.en, e.ur), lines: [...(e.title ? [{ text: e.title }] : []), { text: e.code, code: true, tone: "muted" }] } : undefined,
    meta: meta({ label: L("status"), value: { text: biKey((x) => x.purchasing.statuses, doc.status) } }, { label: L("notes"), value: text(doc.notes) }),
    blocks: [
      { type: "statement", sections: [
        { title: T("gross_pay"), rows: rows(earn), total: { label: T("gross_pay"), value: rupees(t.gross ?? "0") } },
        { title: T("deductions"), rows: rows(cut), total: { label: T("deductions"), value: rupees(t.deducted ?? "0") } },
        { rows: [], total: { label: T("net_pay"), value: rupees(t.total ?? "0") }, strong: true },
      ] },
      { type: "totals", rows: [...total(T("paid"), t.paid), ...total(T("pending"), t.outstanding, { strong: true, cell: owed(t.outstanding) }), ...total(T("advances"), e?.advances, { show: !isZero(e?.advances), line: true })] },
      ...paymentsTable(doc),
    ],
    signatures: S("prepared", "authorised", "employee"),
  };
}

/** Model of a saved document. */
export function buildDocument(kind: DocumentKind, doc: DocumentData, settings: DocumentSettings): DocModel {
  switch (kind) {
    case "sales_invoice": return salesInvoice(doc, settings);
    case "purchase_invoice": return purchaseInvoice(doc);
    case "purchase_order": return purchaseOrder(doc);
    case "goods_receipt": return goodsReceipt(doc);
    case "delivery_challan": case "sol_challan": return challan(doc, kind);
    case "customer_receipt": case "sol_receipt": return customerReceipt(doc, kind);
    case "supplier_receipt": return supplierReceipt(doc);
    case "sol_invoice": return solInvoice(doc, settings);
    case "expense_voucher": return expenseVoucher(doc);
    case "supplier_return": return supplierReturn(doc);
    case "company_money": case "cash_voucher": case "cash_deposit": return moneyVoucher(doc, kind);
    case "salary_slip": case "salary_slips": return salarySlip(doc);
    default: throw new Error(`No template for ${kind}`);
  }
}

export const periodBi = (from: string, to: string): Bi => {
  const [a, b] = [dateBi(from), dateBi(to)];
  return from === to ? a : { en: bi((t) => t.docs.period, { from: a.en, to: b.en }).en, ur: bi((t) => t.docs.period, { from: a.ur, to: b.ur }).ur };
};
export const asOfBi = (iso: string): Bi => ({ en: bi((t) => t.docs.asOf, { date: dateBi(iso).en }).en, ur: bi((t) => t.docs.asOf, { date: dateBi(iso).ur }).ur });
