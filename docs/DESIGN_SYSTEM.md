# Design System

Bright enterprise interface: white cards on light grey, navy for headings and brand, blue as the only interactive colour. Light theme only. In development, `/design-system` shows every component (it returns "not found" in production).

## Tokens (`src/app/globals.css`)

| Use | Classes |
|---|---|
| Page, card, quiet fill | `bg-background`, `bg-card`, `bg-muted` |
| Headings, brand | `text-navy`, `bg-navy` |
| Actions, selection | `bg-primary`, `bg-accent text-accent-foreground` |
| State (always with text or icon) | `success`, `warning`, `destructive`, each with a `-soft` background |
| Elevation | `shadow-card` for surfaces, `shadow-overlay` for dialogs, menus and toasts |
| Charts | `--chart-1` … `--chart-5`, fixed order (validated for colour-vision deficiency) |

Never use raw colours (`text-blue-600`, hex) in components. Text meets WCAG AA contrast.

**Type:** Marcellus (`font-heading`) for the wordmark and page titles, Geist for everything else, Noto Nastaliq Urdu for all Urdu text. Latin faces come first in the stack so digits, codes and names look the same in both languages. Only real font faces are used (see `layout.tsx`): the fallback faces `next/font` adds contain Arabic letters and would replace Nastaliq.

## Components

| Need | Use |
|---|---|
| Page title, breadcrumbs, actions | `layout/page-header` |
| Titled surface / one figure / record fields | `shared/section-card`, `shared/stat-card`, `shared/description-list` |
| Any list | `tables/data-table` (sort, search, paging, phone cards); `tables/url-filters` when the server filters |
| List described on the server, totals, CSV, print | `tables/spec-table` |
| Tabs between the pages of a module | `layout/sub-nav` |
| Document with lines | `documents/document-form` + `documents/line-editor` (or `issue-lines` when stock leaves); `draft-actions`, `action-button` and `document-status` on its page |
| Choose a customer, settle invoices, show the order steps, print a document | `documents/customer-picker`, `invoice-allocations`, `order-steps`, `print-button` (`.page-portrait` for A4 portrait) |
| Sales report page | `components/reports/sales-report` |
| Form | `FormSection` and `FormActions` from `forms/form-section`, `Field` from `forms/field`, `hooks/use-unsaved-changes` |
| Inputs | `ui/input`, `NativeSelect`, `PasswordInput`, `MoneyInput` (decimal string), `IconInput` |
| Confirmation | `shared/confirm-dialog` — every destructive or irreversible action |
| Success message | `toast.add({ title, type: "success" })` from `ui/toast` |
| Errors in place | `forms/action-error`, `FormAlert` |
| Empty, error, forbidden, not found | `shared/states`, `layout/error-view`, `layout/forbidden`, `layout/not-found-view` |
| Loading | `loading.tsx` with `LoadingRegion` and the skeletons in `shared/states` |
| Status | `shared/status-badge` |
| Phone, email, code, amount inside text | `Ltr` and `Money` from `shared/bidi` |
| Link that looks like a button | `shared/link-button` |
| Independently loading part of a page | `dashboard/section` (`DataSection`: skeleton, error and retry per section) |
| Charts | `charts/bar-list`, `charts/column-chart`, `charts/line-chart` |

Charts take `{ value, display }`: `value` only sizes the mark, `display` is the exact formatted text (for money, from `formatPaisa`). Every chart can be viewed as a table.

## Languages and direction

- All text comes from `src/i18n/en.ts` and `ur.ts`; `fill()` inserts `{placeholders}`. Tests check that both have the same keys and placeholders.
- Use logical classes only: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `border-s`. Exception: `Sheet` and `Sidebar` take a physical `side`.
- Mirror direction icons with `rtl:-scale-x-100` (chevrons, arrows). Do not mirror search, check or media icons.
- Do not put `dir="ltr"` on a table cell; wrap the value in `Ltr`, which keeps the column's alignment. Wrap names placed next to dates or numbers in `<bdi>`; inside dictionary sentences use `isolate()`.
- Switching language re-renders in place and keeps unsaved input. To keep it that way: never key a component by locale, never render a different tree per locale, hold form state in React Hook Form or `useState`, and store validation errors as dictionary keys.

## Responsive rules

Sidebar from `lg` (collapsible, remembered in the `ayra_sidebar` cookie); drawer below it. Tables become cards below `md`. No horizontal page scroll: give flex and grid children `min-w-0`, and long values `break-words`.

## Adding a module

1. Create `src/app/(dashboard)/<module>/page.tsx` (it takes over the planned-module page) and remove `planned: true` in `src/config/navigation.ts`.
2. Guard with `requireActiveSession()` and `can()`; add `generateMetadata` and a fitting `loading.tsx`.
3. Add record search to `src/features/search/actions.ts` and attention items to `src/features/notifications/queries.ts`, from live data only.
