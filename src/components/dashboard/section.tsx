import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { SectionError } from "./section-error";

/** Functions or tables missing from the database: the newest migration has not been applied. */
const OUTDATED_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

async function Loaded<T>({ name, load, children }: { name: string; load: () => Promise<T>; children: (data: T) => React.ReactNode }) {
  let data: T;
  try {
    data = await load();
  } catch (error) {
    unstable_rethrow(error);
    console.error(`Dashboard section "${name}":`, error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return <SectionError name={name} outdated={OUTDATED_CODES.has(code)} reference={code || "—"} />;
  }
  return <>{children(data)}</>;
}

/** Streams one part of the dashboard: its own skeleton, and its own error that leaves the rest intact. */
export function DataSection<T>({ name, skeleton, load, children }: {
  name: string;
  skeleton: React.ReactNode;
  load: () => Promise<T>;
  children: (data: T) => React.ReactNode;
}) {
  return (
    <Suspense fallback={<div aria-busy="true">{skeleton}</div>}>
      <Loaded name={name} load={load}>{children}</Loaded>
    </Suspense>
  );
}
