"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { useI18n } from "@/i18n/context";
import { ErrorView } from "@/components/layout/error-view";
import { Button } from "@/components/ui/button";

/** Errors outside the application shell, including a session whose profile cannot be read; offers a way out. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <ErrorView error={error} retry={retry} />
      <form action={signOutAction} className="text-center">
        <Button type="submit" variant="ghost"><LogOut className="rtl:-scale-x-100" aria-hidden />{t.auth.signOut}</Button>
      </form>
    </main>
  );
}
