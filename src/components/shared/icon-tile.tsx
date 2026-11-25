import {
  Banknote, BarChart3, Boxes, Building2, ClipboardList, CreditCard, Factory, HandCoins, History, Landmark, LayoutDashboard, Package, PackageCheck, PackagePlus,
  Receipt, ReceiptText, Scale, ScrollText, Settings, ShieldCheck, ShoppingCart, TrendingUp, Truck, UserCheck, UserCog, UserPlus, UserRound, Users, Wallet, Warehouse, Waypoints,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  blue: "bg-tone-blue-soft text-tone-blue ring-tone-blue/12",
  indigo: "bg-tone-indigo-soft text-tone-indigo ring-tone-indigo/12",
  sky: "bg-tone-sky-soft text-tone-sky ring-tone-sky/12",
  teal: "bg-tone-teal-soft text-tone-teal ring-tone-teal/12",
  slate: "bg-tone-slate-soft text-tone-slate ring-tone-slate/12",
  attention: "bg-warning-soft text-warning ring-warning/15",
  danger: "bg-destructive-soft text-destructive ring-destructive/15",
} as const;

export type Tone = keyof typeof TONES;

/** Each area of the business keeps one tone on every screen: sales blue, purchasing indigo, stock and fleet sky, money teal, administration slate. */
const AREAS: [Exclude<Tone, "attention" | "danger">, LucideIcon[]][] = [
  ["indigo", [Factory, Receipt, ReceiptText, ClipboardList, CreditCard, PackagePlus, Users, UserCheck, UserRound, UserPlus, BarChart3]],
  ["sky", [Boxes, Package, PackageCheck, Warehouse, Truck, Waypoints]],
  ["teal", [Banknote, Landmark, Wallet, HandCoins, ScrollText, Scale]],
  ["slate", [Settings, ShieldCheck, History, UserCog]],
  ["blue", [LayoutDashboard, ShoppingCart, TrendingUp, Building2]],
];
const TONE_OF = new Map<LucideIcon, Tone>(AREAS.flatMap(([tone, icons]) => icons.map((icon) => [icon, tone] as const)));

export const toneOf = (icon: LucideIcon): Tone => TONE_OF.get(icon) ?? "blue";

const SIZES = { sm: "size-9 rounded-[0.65rem] [&_svg]:size-4.5", md: "size-11 rounded-xl [&_svg]:size-5", lg: "size-13 rounded-2xl [&_svg]:size-6" } as const;

/** Icon on a soft tile in the tone of its area. Decoration: the text beside it names the thing. */
export function IconTile({ icon: Icon, tone, size = "md", className }: { icon: LucideIcon; tone?: Tone; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center ring-1 ring-inset", SIZES[size], TONES[tone ?? toneOf(Icon)], className)}>
      <Icon />
    </span>
  );
}

/** Initial of a person or business. */
export function InitialTile({ name, tone = "blue", className }: { name: string; tone?: Tone; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm leading-none font-semibold ring-1 ring-inset", TONES[tone], className)}>
      {[...name.trim()][0]?.toLocaleUpperCase() ?? "?"}
    </span>
  );
}
