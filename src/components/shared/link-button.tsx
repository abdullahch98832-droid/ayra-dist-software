import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Navigation that looks like a button but stays a real link. */
export function LinkButton({ variant, size, className, ...props }: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link data-slot="button" {...props} className={cn(buttonVariants({ variant, size }), className)} />;
}
