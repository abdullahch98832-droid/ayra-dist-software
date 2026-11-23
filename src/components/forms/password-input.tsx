"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { Input } from "@/components/ui/input";

export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type" | "dir">) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} dir="ltr" className="px-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.common.hidePassword : t.common.showPassword}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
