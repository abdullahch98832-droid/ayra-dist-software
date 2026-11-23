"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { ArrowLeft, Mail } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/i18n/context";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/forms/field";
import { IconInput } from "@/components/forms/icon-input";
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
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {sent && <FormAlert tone="success">{t.auth.resetLinkSent}</FormAlert>}
      <Field id="email" label={t.auth.email} error={form.formState.errors.email?.message}>
        <IconInput id="email" icon={Mail} type="email" autoComplete="username" dir="ltr" {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.processing : t.auth.sendResetLink}</Button>
      <Link href="/login" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />{t.auth.backToLogin}
      </Link>
    </form>
  );
}
