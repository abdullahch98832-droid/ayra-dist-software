import { cn } from "@/lib/utils";

/** Titled group of fields: one column on phones, two from `sm`. */
export function FormSection({
  title, description, className, children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className={cn("grid gap-5 p-5 sm:grid-cols-2", className)}>{children}</div>
    </section>
  );
}

/** Save and cancel. Sticks to the bottom of the screen on phones so long forms stay usable. */
export function FormActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}
