import { getT } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.auth.forgotTitle}</CardTitle>
        <CardDescription>{t.auth.forgotSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
