import { getT } from "@/i18n/server";
import { AuthPanel } from "@/components/layout/auth-panel";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <AuthPanel title={t.auth.forgotTitle} description={t.auth.forgotSubtitle}>
      <ForgotPasswordForm />
    </AuthPanel>
  );
}
