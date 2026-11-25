"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImageIcon, Upload } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/validation/employees";
import { ActionError } from "@/components/forms/action-error";
import { useMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Uploads one image for a saved record. The action receives `id` and `file`. */
export function ImageUploader({ id, url, title, buttonLabel, success, canEdit, action }: {
  id: string;
  url?: string;
  title: string;
  buttonLabel: string;
  success: string;
  canEdit: boolean;
  action: (data: FormData) => Promise<ActionResult>;
}) {
  const { t } = useI18n();
  const message = useMessage();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const onChange = (file: File | undefined) => {
    if (!file) return;
    if (!PHOTO_TYPES[file.type]) return setResult({ ok: false, code: "validation", fieldErrors: { file: ["fileType"] } });
    if (file.size > PHOTO_MAX_BYTES) return setResult({ ok: false, code: "validation", fieldErrors: { file: ["fileTooLarge"] } });
    const data = new FormData();
    data.set("id", id);
    data.set("file", file);
    startTransition(async () => {
      const res = await action(data);
      setResult(res);
      if (res.ok) toast.add({ title: success, type: "success" });
    });
  };
  const fieldError = result && !result.ok ? result.fieldErrors?.file?.[0] : undefined;

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-5 shadow-card">
      <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
        {url ? <Image src={url} alt={title} width={96} height={96} unoptimized className="size-full object-cover" /> : <ImageIcon className="size-8" aria-hidden />}
      </span>
      <div className="grid gap-2">
        <p className="text-sm font-medium">{title}</p>
        {canEdit && (
          <>
            <input ref={input} type="file" accept={Object.keys(PHOTO_TYPES).join(",")} className="hidden" aria-label={buttonLabel} onChange={(e) => onChange(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => input.current?.click()}>
              <Upload aria-hidden />{pending ? t.common.processing : buttonLabel}
            </Button>
            <p className="text-xs text-muted-foreground">{t.employees.photoHint}</p>
          </>
        )}
        {fieldError && <p role="alert" className="text-sm text-destructive">{message(fieldError)}</p>}
        <ActionError result={result} />
      </div>
    </div>
  );
}
