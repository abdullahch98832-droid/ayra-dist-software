import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function EmployeeAvatar({ name, url, className }: { name: string; url?: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
    </Avatar>
  );
}
