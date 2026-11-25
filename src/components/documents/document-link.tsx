import { FileText } from "lucide-react";
import { documentHref, type DocumentKind } from "@/features/documents/kinds";
import { LinkButton } from "@/components/shared/link-button";

/** Opens the preview of a document, where it is printed, downloaded and its language chosen. */
export function DocumentLink({ kind, params, label }: { kind: DocumentKind; params?: Record<string, string | null | undefined>; label: string }) {
  return <LinkButton variant="outline" href={documentHref(kind, params)}><FileText aria-hidden />{label}</LinkButton>;
}
