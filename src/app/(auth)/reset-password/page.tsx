import { getT } from "@/i18n/server";
import { AuthPanel } from "@/components/layout/auth-panel";
import { SetPasswordForm } from "./set-password-form";

/** Reached from invitation and password-reset links (the proxy requires a session). */
export default async function ResetPasswordPage() {
  const t = await getT();
  return (
    <AuthPanel title={t.auth.setPasswordTitle} description={t.auth.setPasswordSubtitle}>
      <SetPasswordForm />
    </AuthPanel>
  );
}
