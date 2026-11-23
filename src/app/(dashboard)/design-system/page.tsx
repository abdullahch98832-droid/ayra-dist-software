import { notFound } from "next/navigation";
import { requireActiveSession } from "@/lib/auth/session";
import { Gallery } from "./gallery";

/** Component gallery with placeholder values. Development only: it does not exist in production. */
export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireActiveSession();
  return <Gallery />;
}
