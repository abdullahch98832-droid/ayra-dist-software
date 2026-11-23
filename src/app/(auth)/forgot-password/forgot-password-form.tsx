"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/i18n/context";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormAlert } from "@/components/forms/field";
import { requestPasswordResetAction } from "../actions";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await requestPasswordResetAction(values);
      setSent(result.ok);
    })
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {sent && <FormAlert tone="success">{t.auth.resetLinkSent}</FormAlert>}
      <Field id="email" label={t.auth.email} error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" dir="ltr" {...form.register("email")} />
      </Field>
      <Button type="submit" disabled={pending}>{t.auth.sendResetLink}</Button>
      <Link href="/login" className="text-center text-sm text-primary hover:underline">{t.auth.backToLogin}</Link>
    </form>
  );
}
