"use client";

import { Button } from "@/components/ui/button";

/** Prints the page; the print styles leave only its content. */
export function PrintButton({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return <Button variant="outline" onClick={() => window.print()}>{icon}{label}</Button>;
}
