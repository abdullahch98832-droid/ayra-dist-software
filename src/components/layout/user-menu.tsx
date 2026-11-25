"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CircleUser, LogOut } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ltr } from "@/components/shared/bidi";

export interface ShellUser {
  fullName: string;
  email: string;
  roleName: string;
}

export function UserMenu({ user }: { user: ShellUser }) {
  const { t } = useI18n();
  const [signingOut, startSignOut] = useTransition();
  const name = user.fullName || user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-11 gap-2.5 px-1.5 sm:px-2" />} aria-label={`${t.profile.title}: ${name}`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#3f7dff,#14284f)] text-sm font-semibold text-white ring-2 ring-accent" aria-hidden>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="hidden max-w-44 text-start lg:block">
          <span className="block truncate text-sm leading-tight">{name}</span>
          <span className="block truncate text-xs leading-tight font-normal text-muted-foreground">{user.roleName}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="block truncate"><Ltr>{user.email}</Ltr></span>
            <span className="block truncate">{user.roleName}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}><CircleUser aria-hidden />{t.profile.title}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} closeOnClick={false} onClick={() => startSignOut(() => signOutAction())}>
          <LogOut className="rtl:-scale-x-100" aria-hidden />{t.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
