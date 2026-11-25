/** Heading and body of a sign-in screen. */
export function AuthPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="animate-rise grid gap-7 rounded-3xl border bg-card p-6 shadow-raised sm:p-9">
      <div className="grid gap-1.5">
        <h1 className="font-heading text-[1.9rem] leading-tight text-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
