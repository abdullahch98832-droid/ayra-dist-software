"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { inviteUserSchema, type InviteUserValues } from "@/lib/validation/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";
import { formatDateTime } from "@/components/shared/format";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import {
  assignRoleAction, inviteUserAction, linkEmployeeAction, sendPasswordResetAction, setUserStatusAction,
} from "./actions";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role_name_en: string | null;
  role_name_ur: string | null;
  employee_id: string | null;
  employee_name: string | null;
  status: string;
  last_sign_in_at: string | null;
}
interface RoleOption { id: string; code: string; name_en: string; name_ur: string }
interface EmployeeOption { id: string; employee_code: string; full_name: string }

type DialogState =
  | { kind: "invite" }
  | { kind: "role" | "employee" | "suspended" | "removed" | "active"; user: UserRow }
  | null;

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "green", invited: "blue", suspended: "amber", removed: "red", no_role: "gray",
};

export function UsersTable({
  users, roles, employees, currentUserId, canManage,
}: {
  users: UserRow[];
  roles: RoleOption[];
  employees: EmployeeOption[];
  currentUserId: string;
  canManage: boolean;
}) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const roleName = (r: { name_en: string | null; name_ur: string | null }) => (locale === "ur" ? r.name_ur : r.name_en) ?? "";
  const statusLabels = t.users.statusLabels as Record<string, string>;

  const run = (action: () => Promise<ActionResult<unknown>>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setDialog(null);
        setError(null);
        if (result.data === "authWarning") toast.add({ title: t.users.authWarning, type: "warning", timeout: 0 });
        else if (success) toast.add({ title: success, type: "success" });
      } else {
        setError(result);
      }
    });

  const close = () => { setDialog(null); setError(null); };

  const columns: DataTableColumn<UserRow>[] = [
    {
      id: "name", header: t.common.name, primary: true, sortValue: (u) => u.full_name || u.email,
      cell: (u) => (
        <div className="min-w-0">
          <p className="font-medium break-words">
            {u.full_name || "—"}
            {u.id === currentUserId && <span className="ms-1.5 text-xs font-normal text-muted-foreground">({t.common.you})</span>}
          </p>
          <Ltr className="text-xs break-all text-muted-foreground">{u.email}</Ltr>
        </div>
      ),
    },
    {
      id: "role", header: t.users.role, sortValue: (u) => roleName({ name_en: u.role_name_en, name_ur: u.role_name_ur }),
      cell: (u) => (u.role_id ? roleName({ name_en: u.role_name_en, name_ur: u.role_name_ur }) : "—"),
    },
    {
      id: "employee", header: t.users.employee, hideBelow: "lg", sortValue: (u) => u.employee_name,
      cell: (u) => u.employee_name ?? <span className="text-muted-foreground">{t.users.noEmployee}</span>,
    },
    {
      id: "status", header: t.common.status, sortValue: (u) => statusLabels[u.status] ?? u.status,
      cell: (u) => <StatusBadge tone={STATUS_TONE[u.status] ?? "gray"}>{statusLabels[u.status] ?? u.status}</StatusBadge>,
    },
    {
      id: "lastSignIn", header: t.users.lastSignIn, hideBelow: "lg", sortValue: (u) => u.last_sign_in_at,
      cell: (u) => <span className="text-muted-foreground">{formatDateTime(u.last_sign_in_at, locale) ?? t.common.never}</span>,
    },
  ];

  const rowActions = (u: UserRow) => u.id === currentUserId ? null : (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`${t.common.actions}: ${u.full_name || u.email}`} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {u.status !== "removed" && (
          <DropdownMenuItem onClick={() => setDialog({ kind: "role", user: u })}>{t.users.changeRole}</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setDialog({ kind: "employee", user: u })}>{t.users.linkEmployee}</DropdownMenuItem>
        {u.status !== "removed" && (
          <DropdownMenuItem onClick={() => run(() => sendPasswordResetAction(u.id), t.users.passwordResetSent)}>
            {t.users.sendPasswordReset}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {(u.status === "suspended" || u.status === "removed") && (
          <DropdownMenuItem onClick={() => setDialog({ kind: "active", user: u })}>{t.users.reactivate}</DropdownMenuItem>
        )}
        {u.status !== "suspended" && u.status !== "removed" && (
          <DropdownMenuItem onClick={() => setDialog({ kind: "suspended", user: u })}>{t.users.suspend}</DropdownMenuItem>
        )}
        {u.status !== "removed" && (
          <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: "removed", user: u })}>{t.users.removeAccess}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const confirming = dialog?.kind === "suspended" || dialog?.kind === "removed" ? { kind: dialog.kind, user: dialog.user } : null;
  const inviteButton = canManage && (
    <Button onClick={() => setDialog({ kind: "invite" })}><UserPlus aria-hidden />{t.users.invite}</Button>
  );

  return (
    <div className="grid gap-4">
      {!dialog && <ActionError result={error} />}
      <DataTable
        rows={users}
        columns={columns}
        rowKey={(u) => u.id}
        caption={t.users.title}
        searchText={(u) => [u.full_name, u.email, u.role_name_en, u.role_name_ur, u.employee_name].join(" ")}
        toolbar={<div className="sm:ms-auto">{inviteButton}</div>}
        actions={canManage ? rowActions : undefined}
        empty={{ title: t.states.emptyTitle, action: inviteButton }}
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && close()}
        title={confirming?.kind === "removed" ? t.users.removeAccess : t.users.suspend}
        subject={confirming ? confirming.user.full_name || confirming.user.email : undefined}
        description={confirming?.kind === "removed" ? t.users.confirmRemove : t.users.confirmSuspend}
        confirmLabel={confirming?.kind === "removed" ? t.users.removeAccess : t.users.suspend}
        pending={pending}
        error={error}
        onConfirm={() => confirming && run(() => setUserStatusAction({ userId: confirming.user.id, status: confirming.kind, roleId: "" }), t.common.saved)}
      />

      <Dialog open={dialog !== null && !confirming} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog?.kind === "invite" && (
            <InviteForm
              roles={roles}
              employees={employees}
              roleName={roleName}
              pending={pending}
              error={error}
              onCancel={close}
              onSubmit={(values) => run(() => inviteUserAction(values), t.users.inviteSent)}
            />
          )}
          {(dialog?.kind === "role" || dialog?.kind === "employee") && (
            <PickerForm
              title={dialog.kind === "role" ? t.users.changeRole : t.users.linkEmployee}
              subject={dialog.user}
              label={dialog.kind === "role" ? t.users.role : t.users.employee}
              initial={(dialog.kind === "role" ? dialog.user.role_id : dialog.user.employee_id) ?? ""}
              options={dialog.kind === "role"
                ? roles.map((r) => ({ value: r.id, label: roleName(r) }))
                : [{ value: "", label: t.users.noEmployee }, ...employees.map((e) => ({ value: e.id, label: `${e.employee_code} — ${e.full_name}` }))]}
              required={dialog.kind === "role"}
              pending={pending}
              error={error}
              onCancel={close}
              onSubmit={(value) => run(() => dialog.kind === "role"
                ? assignRoleAction(dialog.user.id, value)
                : linkEmployeeAction(dialog.user.id, value), t.common.saved)}
            />
          )}
          {dialog?.kind === "active" && (
            <PickerForm
              title={t.users.reactivate}
              subject={dialog.user}
              label={t.users.reactivateRole}
              initial={dialog.user.role_id ?? ""}
              options={roles.map((r) => ({ value: r.id, label: roleName(r) }))}
              required
              pending={pending}
              error={error}
              onCancel={close}
              onSubmit={(value) => run(() => setUserStatusAction({ userId: dialog.user.id, status: "active", roleId: value }), t.common.saved)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteForm({
  roles, employees, roleName, pending, error, onCancel, onSubmit,
}: {
  roles: RoleOption[];
  employees: EmployeeOption[];
  roleName: (r: RoleOption) => string;
  pending: boolean;
  error: ActionResult<unknown> | null;
  onCancel: () => void;
  onSubmit: (values: InviteUserValues) => void;
}) {
  const { t } = useI18n();
  const form = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: "", fullName: "", roleId: "", employeeId: "" },
  });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{t.users.inviteTitle}</DialogTitle>
        <DialogDescription>{t.users.inviteDescription}</DialogDescription>
      </DialogHeader>
      <ActionError result={error} />
      <Field id="invite-name" label={t.users.fullName} required error={errors.fullName?.message}>
        <Input id="invite-name" {...form.register("fullName")} />
      </Field>
      <Field id="invite-email" label={t.common.email} required error={errors.email?.message}>
        <Input id="invite-email" type="email" dir="ltr" {...form.register("email")} />
      </Field>
      <Field id="invite-role" label={t.users.role} required error={errors.roleId?.message}>
        <NativeSelect id="invite-role" {...form.register("roleId")}>
          <option value="">—</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{roleName(r)}</option>)}
        </NativeSelect>
      </Field>
      {employees.length > 0 && (
        <Field id="invite-employee" label={t.users.employee} optional>
          <NativeSelect id="invite-employee" {...form.register("employeeId")}>
            <option value="">{t.users.noEmployee}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} — {e.full_name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.processing : t.users.sendInvite}</Button>
      </DialogFooter>
    </form>
  );
}

function PickerForm({
  title, subject, label, initial, options, required, pending, error, onCancel, onSubmit,
}: {
  title: string;
  subject: UserRow;
  label: string;
  initial: string;
  options: { value: string; label: string }[];
  required: boolean;
  pending: boolean;
  error: ActionResult<unknown> | null;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!required || value) onSubmit(value); }}
      className="grid gap-5"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{subject.full_name || subject.email}</DialogDescription>
      </DialogHeader>
      <ActionError result={error} />
      <Field id="picker" label={label}>
        <NativeSelect id="picker" value={value} onChange={(e) => setValue(e.target.value)} required={required}>
          {required && <option value="">—</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending || (required && !value)}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
