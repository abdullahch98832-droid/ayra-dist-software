"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { loginSchema, type LoginValues } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, useMessage } from "@/components/forms/field";
import { signInAction } from "../actions";

export function LoginForm({ next, disabled }: { next?: string; disabled: boolean }) {
  const { t } = useI18n();
  const message = useMessage();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => setResult(await signInAction(values, next)))
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {result && !result.ok && result.code !== "validation" && (
        <FormAlert>{message(result.message) ?? t.errors.unexpected}</FormAlert>
      )}
      <Field id="email" label={t.auth.email} error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" dir="ltr" {...form.register("email")} aria-invalid={!!errors.email} />
      </Field>
      <Field id="password" label={t.auth.password} error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" dir="ltr" {...form.register("password")} aria-invalid={!!errors.password} />
      </Field>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? t.auth.signingIn : t.auth.signIn}
      </Button>
    </form>
  );
}
