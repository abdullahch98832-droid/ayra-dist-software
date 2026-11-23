"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { setPasswordSchema, type SetPasswordValues } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, useMessage } from "@/components/forms/field";
import { setPasswordAction } from "../actions";

export function SetPasswordForm() {
  const { t } = useI18n();
  const message = useMessage();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const form = useForm<SetPasswordValues>({ resolver: zodResolver(setPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => startTransition(async () => setResult(await setPasswordAction(values))));

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {result && !result.ok && result.code !== "validation" && <FormAlert>{message(result.message) ?? t.errors.unexpected}</FormAlert>}
      <Field id="password" label={t.auth.newPassword} error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" dir="ltr" {...form.register("password")} />
      </Field>
      <Field id="confirm" label={t.auth.confirmPassword} error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" dir="ltr" {...form.register("confirm")} />
      </Field>
      <Button type="submit" disabled={pending}>{t.auth.setPassword}</Button>
    </form>
  );
}
