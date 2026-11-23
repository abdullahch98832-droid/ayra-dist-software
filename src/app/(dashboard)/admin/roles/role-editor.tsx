"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Plus } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { PERMISSION_MODULES } from "@/lib/auth/permissions";
import { roleSchema, type RoleValues } from "@/lib/validation/admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { createRoleAction, deleteRoleAction, setRolePermissionAction, updateRoleAction } from "./actions";

interface Role { id: string; code: string; name_en: string; name_ur: string; description: string | null; is_system: boolean }
interface PermissionRow { code: string; module: string; description_en: string; description_ur: string }
interface Grant { role_id: string; permission_code: string }

/** Grants that expose costs, salaries, bank details, ledgers, reports or user administration. */
const CONFIDENTIAL = new Set([
  "purchasing.view", "payables.view", "company.view", "costs.view", "payroll.view", "cash_bank.view",
  "accounting.view", "reports.financial", "audit.view", "users.view", "users.manage", "settings.manage",
]);

export function RoleEditor({
  roles, permissions, grants, userCounts, canManage, initialRoleId,
}: {
  roles: Role[];
  permissions: PermissionRow[];
  grants: Grant[];
  userCounts: Record<string, number>;
  canManage: boolean;
  initialRoleId?: string;
}) {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState(initialRoleId && roles.some((r) => r.id === initialRoleId) ? initialRoleId : roles[0]?.id);
  const [dialog, setDialog] = useState<"new" | "edit" | "delete" | null>(null);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticGrants, toggleGrant] = useOptimistic(
    grants,
    (state, change: { roleId: string; code: string; enabled: boolean }) =>
      change.enabled
        ? [...state, { role_id: change.roleId, permission_code: change.code }]
        : state.filter((g) => !(g.role_id === change.roleId && g.permission_code === change.code))
  );

  const role = roles.find((r) => r.id === selectedId);
  const granted = useMemo(
    () => new Set(optimisticGrants.filter((g) => g.role_id === selectedId).map((g) => g.permission_code)),
    [optimisticGrants, selectedId]
  );
  const byModule = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) map.set(p.module, [...(map.get(p.module) ?? []), p]);
    const order = PERMISSION_MODULES as readonly string[];
    return [...map].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [permissions]);

  const locked = !canManage || role?.code === "super_admin";
  const name = (r: Role) => (locale === "ur" ? r.name_ur : r.name_en);
  const modules = t.modules as Record<string, string>;

  const toggle = (code: string, enabled: boolean) => {
    if (!role || locked) return;
    startTransition(async () => {
      toggleGrant({ roleId: role.id, code, enabled });
      const result = await setRolePermissionAction(role.id, code, enabled);
      setError(result.ok ? null : result);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        {canManage && (
          <Button variant="outline" className="justify-start" onClick={() => { setError(null); setDialog("new"); }}>
            <Plus aria-hidden />{t.roles.newRole}
          </Button>
        )}
        <NativeSelect className="lg:hidden" aria-label={t.users.role} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{name(r)}</option>)}
        </NativeSelect>
        <ul className="hidden gap-0.5 rounded-xl border bg-card p-1.5 shadow-card lg:grid">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-current={r.id === selectedId || undefined}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  r.id === selectedId ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <span>{name(r)}</span>
                <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums" title={t.roles.users}>{userCounts[r.id] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {role && (
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5 shadow-card">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-navy">{name(role)}</h2>
                <StatusBadge tone={role.is_system ? "blue" : "gray"} dot={false}>{role.is_system ? t.roles.system : t.roles.custom}</StatusBadge>
              </div>
              <Ltr className="font-mono text-xs text-muted-foreground">{role.code}</Ltr>
              {role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}
              <p className="mt-1 text-sm text-muted-foreground">{t.roles.users}: {userCounts[role.id] ?? 0}</p>
            </div>
            {canManage && !role.is_system && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setError(null); setDialog("edit"); }}>{t.common.edit}</Button>
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => { setError(null); setDialog("delete"); }}>{t.roles.deleteRole}</Button>
              </div>
            )}
          </div>

          {role.code === "super_admin" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />{t.roles.locked}</p>
          )}
          {!dialog && <ActionError result={error} />}

          <div className="grid gap-3 md:grid-cols-2">
            {byModule.map(([module, items]) => (
              <fieldset key={module} className="min-w-0 rounded-xl border bg-card p-5 shadow-card" disabled={locked}>
                <legend className="float-start mb-3 w-full text-sm font-semibold text-navy">{modules[module] ?? module}</legend>
                <div className="clear-both grid gap-3">
                  {items.map((p) => {
                    const id = `perm-${p.code}`;
                    return (
                      <label key={p.code} htmlFor={id} className="flex items-start gap-3 text-sm">
                        <Checkbox
                          id={id}
                          checked={granted.has(p.code)}
                          disabled={locked || pending}
                          onCheckedChange={(checked) => toggle(p.code, checked === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          {locale === "ur" ? p.description_ur : p.description_en}
                          {CONFIDENTIAL.has(p.code) && (
                            <span className="ms-2 inline-block"><StatusBadge tone="amber" dot={false}>{t.roles.confidential}</StatusBadge></span>
                          )}
                          <span className="block"><Ltr className="font-mono text-[0.6875rem] text-muted-foreground">{p.code}</Ltr></span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialog === "new" || dialog === "edit"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {(dialog === "new" || (dialog === "edit" && role)) && (
            <RoleForm
              role={dialog === "edit" ? role : undefined}
              pending={pending}
              error={error}
              onCancel={() => setDialog(null)}
              onSubmit={(values) => startTransition(async () => {
                const result = dialog === "edit" && role ? await updateRoleAction(role.id, values) : await createRoleAction(values);
                if (result.ok) {
                  setDialog(null);
                  setError(null);
                  toast.add({ title: t.common.saved, type: "success" });
                  if (typeof result.data === "string") setSelectedId(result.data);
                } else setError(result);
              })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete" && !!role}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t.roles.deleteRole}
        subject={role ? name(role) : undefined}
        description={t.roles.confirmDelete}
        confirmLabel={t.common.delete}
        pending={pending}
        error={error}
        onConfirm={() => role && startTransition(async () => {
          const result = await deleteRoleAction(role.id);
          if (result.ok) {
            setDialog(null);
            setSelectedId(roles.find((r) => r.id !== role.id)?.id);
            toast.add({ title: t.common.saved, type: "success" });
          } else setError(result);
        })}
      />
    </div>
  );
}

function RoleForm({
  role, pending, error, onCancel, onSubmit,
}: {
  role?: Role;
  pending: boolean;
  error: ActionResult<unknown> | null;
  onCancel: () => void;
  onSubmit: (values: RoleValues) => void;
}) {
  const { t } = useI18n();
  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      code: role?.code ?? "",
      nameEn: role?.name_en ?? "",
      nameUr: role?.name_ur ?? "",
      description: role?.description ?? "",
    },
  });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{role ? t.common.edit : t.roles.newRole}</DialogTitle>
      </DialogHeader>
      <ActionError result={error} />
      <Field id="role-code" label={t.roles.code} hint={t.roles.codeHint} error={errors.code?.message}>
        <Input id="role-code" dir="ltr" disabled={!!role} {...form.register("code")} />
      </Field>
      <Field id="role-en" label={t.roles.nameEn} error={errors.nameEn?.message}>
        <Input id="role-en" dir="ltr" {...form.register("nameEn")} />
      </Field>
      <Field id="role-ur" label={t.roles.nameUr} error={errors.nameUr?.message}>
        <Input id="role-ur" dir="rtl" lang="ur" {...form.register("nameUr")} />
      </Field>
      <Field id="role-desc" label={t.common.description} optional error={errors.description?.message}>
        <Textarea id="role-desc" rows={2} {...form.register("description")} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
