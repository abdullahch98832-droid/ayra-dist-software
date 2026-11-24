import type { Metadata } from "next";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadOpenInvoices } from "@/features/receivables/queries";
import { NOTE_KINDS } from "@/features/receivables/schema";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { NoteForm } from "../note-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.note };
}

export default async function NewNotePage({ searchParams }: PageProps<"/receivables/notes/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "receivables.adjust")) return <Forbidden />;
  const query = await searchParams;
  const kind = NOTE_KINDS.find((k) => k === query.kind) ?? "credit";
  const customer = await loadCustomerOption(uuidParam(query.customer));
  const invoices = customer ? await loadOpenInvoices(customer.id) : [];
  return (
    <>
      <PageHeader title={t.receivables.noteKinds[kind]} breadcrumbs={[{ label: t.receivables.tabs.notes, href: "/receivables/notes" }]} />
      <NoteForm
        customer={customer} invoices={invoices}
        defaults={{ kind, customerId: customer?.id ?? "", invoiceId: invoices.find((i) => i.id === query.invoice)?.id ?? "", date: businessToday(), amount: "", reason: "", requestId: crypto.randomUUID() }}
      />
    </>
  );
}
