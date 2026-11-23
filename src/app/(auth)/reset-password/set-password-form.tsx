"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { setPasswordSchema, type SetPasswordValues } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, useMessage } from "@/components/forms/field";
import { PasswordInput } from "@/components/forms/password-input";
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
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {result && !result.ok && result.code !== "validation" && <FormAlert>{message(result.message) ?? t.errors.unexpected}</FormAlert>}
      <Field id="password" label={t.auth.newPassword} error={errors.password?.message}>
        <PasswordInput id="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field id="confirm" label={t.auth.confirmPassword} error={errors.confirm?.message}>
        <PasswordInput id="confirm" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.auth.setPassword}</Button>
    </form>
  );
}
