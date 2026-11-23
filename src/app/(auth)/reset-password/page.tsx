import { getT } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

/** Reached from invitation and password-reset links (the proxy requires a session). */
export default async function ResetPasswordPage() {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.auth.setPasswordTitle}</CardTitle>
        <CardDescription>{t.auth.setPasswordSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  );
}
