import { ShieldAlert } from "lucide-react";
import { getT } from "@/i18n/server";

export async function Forbidden() {
  const t = await getT();
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">{t.errors.permissionDenied}</p>
    </div>
  );
}
