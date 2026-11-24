import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadCities, loadCustomers } from "@/features/customers/queries";
import { loadTakers, takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).customers.title };
}

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "customers.view")) return <Forbidden />;
  const c = t.customers;
  const query = await searchParams;
  const city = typeof query.city === "string" ? query.city.slice(0, 80) : "";
  const filter = { ...listParams(query, ["active", "inactive"]), takerId: uuidParam(query.taker), city };
  const [{ rows, total }, takers, names, cities] = await Promise.all([loadCustomers(ctx, filter), loadTakers(), takerNames(), loadCities()]);
  const balances = can(ctx, "receivables.view");
  const all = can(ctx, "sales.view_all") || can(ctx, "customers.manage");
  const add = can(ctx, "customers.manage") && <LinkButton href="/customers/new"><Plus aria-hidden />{c.add}</LinkButton>;
  return (
    <>
      <PageHeader title={c.title} description={c.subtitle} actions={add} />
      <SpecTable
        caption={c.title}
        rows={rows.map((x) => {
          const taker = names.get(x.order_taker_id ?? "");
          return {
            id: x.id, name: local(x.name, x.name_ur), nameHref: `/customers/${x.id}`, code: x.code, owner: x.owner_name, phone: x.phone, city: [x.area, x.city].filter(Boolean).join(", "),
            taker: taker ? local(taker.nameEn, taker.nameUr) : null, limit: x.credit_limit, balance: x.balance, status: x.is_active ? "active" : "inactive",
          };
        })}
        columns={[
          { key: "name", sub: "code", label: c.name, kind: "link", primary: true },
          { key: "owner", label: c.owner, kind: "text", hideBelow: "xl" },
          { key: "phone", label: c.phone, kind: "code", hideBelow: "lg" },
          { key: "city", label: c.city, kind: "text", hideBelow: "lg" },
          ...(all ? [{ key: "taker", label: c.orderTaker, kind: "text" as const }] : []),
          { key: "limit", label: c.creditLimit, kind: "money", hideBelow: "xl" },
          ...(balances ? [{ key: "balance", label: c.balance, kind: "money" as const }] : []),
          { key: "status", label: t.common.status, kind: "status", options: { active: { label: c.active, tone: "green" }, inactive: { label: c.inactive, tone: "gray" } } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={c.searchPlaceholder} />
            {all && takers.length > 0 && <UrlSelect param="taker" label={c.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
            {cities.length > 1 && <UrlSelect param="city" label={c.allCities} options={cities.map((x) => ({ value: x, label: x }))} />}
            <UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "active", label: c.active }, { value: "inactive", label: c.inactive }]} />
          </>
        }
        empty={{ title: c.empty, description: c.emptyHint, action: add }}
      />
    </>
  );
}
