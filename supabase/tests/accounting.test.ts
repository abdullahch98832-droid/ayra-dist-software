import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, customer, supplier, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let acc: Record<string, string>;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  acc = Object.fromEntries(
    (await db.sql("select code, id from public.chart_of_accounts")).map((r) => [r.code as string, r.id as string])
  );
});
afterAll(() => db.close());

const manual = (date: string, lines: object[]) =>
  db.as(b.admin, async (q) =>
    one(await q("select public.create_manual_journal($1, 'test', $2) as id", [date, JSON.stringify(lines)])).id as string);

describe("double entry", () => {
  it("rejects an unbalanced entry", async () => {
    await expect(manual("2026-03-01", [
      { account_id: acc["3100"], credit: "100.00" },
      { account_id: acc["4900"], debit: "99.99" },
    ])).rejects.toThrow(/not balanced/);
  });

  it("posts a balanced entry and numbers it from the sequence", async () => {
    const cash = await cashAccount(db);
    const gl = one(await db.sql("select gl_account_id, (select code from public.chart_of_accounts where id = gl_account_id) code from public.financial_accounts where id = $1", [cash]));
    expect(gl.code).toMatch(/^1100\.\d{3}$/);
    const id = await manual("2026-03-01", [
      { account_id: gl.gl_account_id, debit: "50000.00" },
      { account_id: acc["3100"], credit: "50000.00" },
    ]);
    const entry = one(await db.sql("select doc_no, status from public.journal_entries where id = $1", [id]));
    expect(entry.status).toBe("posted");
    expect(entry.doc_no).toMatch(/^JV-\d{6}$/);
  });

  it("keeps posted entries immutable and corrects them by reversal", async () => {
    const id = await manual("2026-03-02", [
      { account_id: acc["6700"], debit: "10.00" },
      { account_id: acc["3100"], credit: "10.00" },
    ]);
    await expect(db.sql("update public.journal_entries set description = 'changed' where id = $1", [id])).rejects.toThrow(/immutable/);
    await expect(db.sql("delete from public.journal_entries where id = $1", [id])).rejects.toThrow(/cannot be deleted/);
    await expect(db.sql("update public.journal_entry_lines set debit = 11 where journal_entry_id = $1", [id])).rejects.toThrow(/posted/);

    const rev = await db.as(b.admin, async (q) =>
      one(await q("select public.reverse_manual_journal($1, '2026-03-03', 'typo') as id", [id])).id as string);
    const sums = one(await db.sql(
      `select sum(debit) filter (where journal_entry_id = $1) d1, sum(credit) filter (where journal_entry_id = $2) c2
         from public.journal_entry_lines where journal_entry_id in ($1, $2)`, [id, rev]));
    expect(sums.d1).toBe(sums.c2);
    expect(one(await db.sql("select reversed_by from public.journal_entries where id = $1", [id])).reversed_by).toBe(rev);
    await expect(db.as(b.admin, (q) => q("select public.reverse_manual_journal($1, '2026-03-03', 'again')", [id])))
      .rejects.toThrow(/already reversed/);
  });

  it("rejects postings into a closed period", async () => {
    await db.sql("insert into public.accounting_periods (name, start_date, end_date, status) values ('Jan 2026', '2026-01-01', '2026-01-31', 'closed')");
    await expect(manual("2026-01-15", [
      { account_id: acc["6700"], debit: "1.00" },
      { account_id: acc["3100"], credit: "1.00" },
    ])).rejects.toThrow(/closed/);
    await expect(db.sql("insert into public.accounting_periods (name, start_date, end_date) values ('Overlap', '2026-01-20', '2026-02-10')"))
      .rejects.toMatchObject({ code: "23P01" });
  });

  it("keeps the trial balance balanced", async () => {
    const tb = one(await db.as(b.admin, (q) => q("select sum(balance_debit) d, sum(balance_credit) c from public.trial_balance('2099-12-31')")));
    expect(tb.d).toBe(tb.c);
  });
});

describe("sub-ledgers", () => {
  it("requires a customer on receivable lines", async () => {
    await expect(manual("2026-03-05", [
      { account_id: acc["1200"], debit: "5.00" },
      { account_id: acc["4900"], credit: "5.00" },
    ])).rejects.toThrow(/require a customer/);
    const c = await customer(db);
    await manual("2026-03-05", [
      { account_id: acc["1200"], debit: "5.00", customer_id: c },
      { account_id: acc["4900"], credit: "5.00" },
    ]);
    expect(one(await db.sql("select balance from public.v_customer_balances where customer_id = $1", [c])).balance).toBe("5.00");
  });

  it("keeps the main company ledger separate from other suppliers", async () => {
    const s = await supplier(db);
    await expect(manual("2026-03-06", [
      { account_id: acc["6700"], debit: "7.00" },
      { account_id: acc["2100"], credit: "7.00", supplier_id: s },
    ])).rejects.toThrow(/main company/);
    await expect(manual("2026-03-06", [
      { account_id: acc["6700"], debit: "7.00" },
      { account_id: acc["2200"], credit: "7.00", supplier_id: b.principal },
    ])).rejects.toThrow(/main company/);
  });

  it("rejects postings to header accounts", async () => {
    await expect(manual("2026-03-07", [
      { account_id: acc["6000"], debit: "1.00" },
      { account_id: acc["3100"], credit: "1.00" },
    ])).rejects.toThrow(/does not accept postings/);
  });

  it("protects system accounts", async () => {
    await expect(db.sql("delete from public.chart_of_accounts where code = '1200'")).rejects.toThrow(/cannot be deleted/);
  });
});
