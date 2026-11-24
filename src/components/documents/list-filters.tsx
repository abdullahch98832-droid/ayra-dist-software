import type { Dictionary } from "@/i18n";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

/** Search and filters of a document list; the server applies them. */
export function ListFilters({ t, local, suppliers = [], children }: {
  t: Dictionary;
  local?: (en: string, ur: string | null | undefined) => string;
  suppliers?: { id: string; nameEn: string; nameUr: string | null }[];
  children?: React.ReactNode;
}) {
  return (
    <>
      <UrlSearch placeholder={t.documents.searchNumber} />
      {suppliers.length > 1 && (
        <UrlSelect param="supplier" label={t.documents.allSuppliers} options={suppliers.map((s) => ({ value: s.id, label: local ? local(s.nameEn, s.nameUr) : s.nameEn }))} />
      )}
      {children}
    </>
  );
}
