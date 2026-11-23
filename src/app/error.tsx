"use client";

import { ErrorView } from "@/components/layout/error-view";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12"><ErrorView error={error} retry={retry} /></main>;
}
