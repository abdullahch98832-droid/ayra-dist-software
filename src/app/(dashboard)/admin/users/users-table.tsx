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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionError } from "@/components/forms/action-error";
import { Field, FormAlert, NativeSelect } from "@/components/forms/field";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";
import { formatDateTime } from "@/components/shared/format";
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
  const [notice, setNotice] = useState<string | null>(null);
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
        setNotice(result.data === "authWarning" ? t.users.authWarning : success ?? null);
      } else {
        setError(result);
      }
    });

  const close = () => { setDialog(null); setError(null); };

  return (
    <div className="grid gap-4">
      {notice && <FormAlert tone="success">{notice}</FormAlert>}
      {!dialog && <ActionError result={error} />}
      {canManage && (
        <div>
          <Button onClick={() => setDialog({ kind: "invite" })} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {t.users.invite}
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t.common.name}</TableHead>
              <TableHead className="text-start">{t.users.role}</TableHead>
              <TableHead className="text-start">{t.users.employee}</TableHead>
              <TableHead className="text-start">{t.common.status}</TableHead>
              <TableHead className="text-start">{t.users.lastSignIn}</TableHead>
              {canManage && <TableHead className="w-12"><span className="sr-only">{t.common.actions}</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t.common.noResults}</TableCell></TableRow>
            )}
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">
                      {u.full_name || "—"}
                      {self && <span className="ms-1 text-xs text-muted-foreground">({t.common.you})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{u.email}</div>
                  </TableCell>
                  <TableCell>{u.role_id ? roleName({ name_en: u.role_name_en, name_ur: u.role_name_ur }) : "—"}</TableCell>
                  <TableCell>{u.employee_name ?? <span className="text-muted-foreground">{t.users.noEmployee}</span>}</TableCell>
                  <TableCell><StatusBadge tone={STATUS_TONE[u.status] ?? "gray"}>{statusLabels[u.status] ?? u.status}</StatusBadge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(u.last_sign_in_at, locale) ?? t.common.never}</TableCell>
                  {canManage && (
                    <TableCell>
                      {!self && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t.common.actions} />}>
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
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
          {(dialog?.kind === "suspended" || dialog?.kind === "removed") && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.kind === "suspended" ? t.users.suspend : t.users.removeAccess}</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-foreground">{dialog.user.full_name || dialog.user.email}</span> —{" "}
                  {dialog.kind === "suspended" ? t.users.confirmSuspend : t.users.confirmRemove}
                </DialogDescription>
              </DialogHeader>
              <ActionError result={error} />
              <DialogFooter>
                <Button variant="outline" onClick={close}>{t.common.cancel}</Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run(() => setUserStatusAction({ userId: dialog.user.id, status: dialog.kind, roleId: "" }), t.common.saved)}
                >
                  {t.common.confirm}
                </Button>
              </DialogFooter>
            </>
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t.users.inviteTitle}</DialogTitle>
        <DialogDescription>{t.users.inviteDescription}</DialogDescription>
      </DialogHeader>
      <ActionError result={error} />
      <Field id="invite-name" label={t.users.fullName} error={errors.fullName?.message}>
        <Input id="invite-name" {...form.register("fullName")} />
      </Field>
      <Field id="invite-email" label={t.common.email} error={errors.email?.message}>
        <Input id="invite-email" type="email" dir="ltr" {...form.register("email")} />
      </Field>
      <Field id="invite-role" label={t.users.role} error={errors.roleId?.message}>
        <NativeSelect id="invite-role" {...form.register("roleId")}>
          <option value="">—</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{roleName(r)}</option>)}
        </NativeSelect>
      </Field>
      {employees.length > 0 && (
        <Field id="invite-employee" label={`${t.users.employee} (${t.common.optional})`}>
          <NativeSelect id="invite-employee" {...form.register("employeeId")}>
            <option value="">{t.users.noEmployee}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} — {e.full_name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{t.users.sendInvite}</Button>
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
      className="grid gap-4"
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
        <Button type="submit" disabled={pending || (required && !value)}>{t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
