# Documents (PDF, printing)

> **Status:** implemented in `supabase/migrations/20261129100000_documents.sql`, `src/lib/pdf` (engine), `src/features/documents` (content) and `/documents/[kind]` (preview).

Every document is an A4 PDF in **English**, **Urdu** or **both languages**. Preview, download and print use the same file.

## Documents

| Kind | From |
|---|---|
| Sales invoice, delivery challan, payment receipt | invoice, delivery, customer payment |
| Purchase order, goods receipt, purchase invoice, supplier payment receipt | purchasing of the Ayra company and of suppliers |
| SOL invoice, SOL challan, SOL payment receipt | SOL job, delivery, payment |
| Expense voucher, salary slip, all slips of a payroll | expenses, payroll |
| Customer, supplier and Ayra company statement | ledger of the party |
| Every report | `/documents/report?report=<slug>`, see REPORTS.md |
| Trial balance, profit and loss, balance sheet, cash flow, general ledger, cash and bank book | accounting |

The address is `/documents/sales-invoice?id=…&lang=ur`; the file itself is `/documents/sales-invoice/pdf?…` (`&download=1` to save it). Build links with `documentHref()`; add a kind in `features/documents/kinds.ts`, a template in `build.ts` or `reports.ts`, and its name in `i18n/modules/documents.*`.

## Figures

- `document_data(kind, id)` and `document_statement(…)` read the **saved transaction** in one step and calculate every total in Postgres. Amounts travel as exact decimal text. Reports use the same database functions as the screens; their column totals are added on the server in whole paisa.
- The functions run **as the reader**: row level security and column privileges decide what a document may say. Costs are never on a sales document; paid, outstanding and balances appear only for those who may see them.
- A document whose lines do not add up to its saved total, a statement whose running balance breaks, or a balance sheet that does not balance is **refused** instead of printed (HTTP 409, explained on the screen).
- Drafts, void, cancelled and rejected documents, and SOL jobs that are not completed, carry a watermark.

## Urdu

- Letters are joined by **HarfBuzz** (the shaping engine of browsers) with **Noto Nastaliq Urdu**; mixed text is ordered by the **Unicode bidirectional algorithm**. No character is reversed by hand.
- Fonts are embedded and subset. An Urdu letter is stored as one glyph put together from its parts (body and dots) exactly where HarfBuzz placed them, and mapped to its character: text can be searched and copied.
- Codes, phones, dates and amounts always read left to right. In columns, amounts line up at their right edge in both directions, with digits of equal width, so decimals stand under each other.
- Tables run right to left, repeat their head on every page, keep the last row with the totals, and number their pages.

No browser runs on the server: the engine is TypeScript and WebAssembly, takes milliseconds, and works on Vercel. `next.config.ts` traces the fonts and the WebAssembly file.

## Letterhead

Address, phone, email, NTN and the closing text of invoices are entered under **Settings → Documents** (`settings.manage`). Empty fields are left out. The wordmark and the Urdu name come from the brand.

## Tests

- `src/lib/pdf/pdf.test.ts`: PDFs read back with pdf.js (words, codes, page heads, alignment, margins, embedded fonts).
- `supabase/tests/documents.test.ts`: every total against the saved lines and the ledger; who may see what.
- Checked once with independent readers (qpdf, MuPDF, PDFium, Apple PDFKit, pdf.js), against Chrome's rendering of the same Urdu words, and through the print path of macOS.

Fonts: Geist, Marcellus and Noto Nastaliq Urdu under the SIL Open Font License (`src/lib/pdf/fonts`).
