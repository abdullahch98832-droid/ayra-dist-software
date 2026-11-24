import { CheckCheck, Pencil, Trash2 } from "lucide-react";
import type { Dictionary } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { LinkButton } from "@/components/shared/link-button";
import { ActionButton } from "./action-button";

type Run = (reason: string) => Promise<ActionResult<unknown>>;

/** Delete, edit and post: the same for every draft document. Render only while the document is a draft. */
export function DraftActions({ t, canEdit, canPost, editHref, listHref, remove, post, postLabel, postConfirm }: {
  t: Dictionary;
  canEdit: boolean;
  canPost: boolean;
  editHref: string;
  listHref: string;
  remove: Run;
  post: Run;
  postLabel?: string;
  postConfirm?: { title: string; description: string };
}) {
  const d = t.documents;
  return (
    <>
      {canEdit && (
        <>
          <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={remove} success={d.deleted} redirectTo={listHref} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
          <LinkButton variant="outline" href={editHref}><Pencil aria-hidden />{d.edit}</LinkButton>
        </>
      )}
      {canPost && <ActionButton label={postLabel ?? d.post} icon={<CheckCheck aria-hidden />} action={post} success={d.posted} confirm={postConfirm ?? { title: d.confirmPostTitle, description: d.confirmPost }} />}
    </>
  );
}
