/** Heading and body of a sign-in screen. */
export function AuthPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="font-heading text-3xl text-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
