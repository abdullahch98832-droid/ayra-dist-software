"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/validation/employees";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ActionError } from "@/components/forms/action-error";
import { useMessage } from "@/components/forms/field";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { uploadEmployeePhotoAction } from "./actions";

export function PhotoUploader({ employeeId, name, url, canEdit }: { employeeId: string; name: string; url?: string; canEdit: boolean }) {
  const { t } = useI18n();
  const message = useMessage();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const onChange = (file: File | undefined) => {
    if (!file) return;
    if (!PHOTO_TYPES[file.type]) return setResult({ ok: false, code: "validation", fieldErrors: { photo: ["fileType"] } });
    if (file.size > PHOTO_MAX_BYTES) return setResult({ ok: false, code: "validation", fieldErrors: { photo: ["fileTooLarge"] } });
    const data = new FormData();
    data.set("employeeId", employeeId);
    data.set("photo", file);
    startTransition(async () => {
      const res = await uploadEmployeePhotoAction(data);
      setResult(res);
      if (res.ok) toast.add({ title: t.employees.photoUpdated, type: "success" });
    });
  };

  const fieldError = result && !result.ok ? result.fieldErrors?.photo?.[0] : undefined;

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
      <EmployeeAvatar name={name} url={url} className="size-20 text-lg" />
      <div className="grid gap-2">
        <p className="text-sm font-medium">{t.employees.photo}</p>
        {canEdit && (
          <>
            <input ref={input} type="file" accept={Object.keys(PHOTO_TYPES).join(",")} className="hidden" aria-label={t.employees.uploadPhoto}
              onChange={(e) => onChange(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => input.current?.click()}>
              <Upload aria-hidden />{pending ? t.common.processing : t.employees.uploadPhoto}
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
