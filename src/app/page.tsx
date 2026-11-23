import { redirect } from "next/navigation";
import { AUTH_CONFIG } from "@/config/auth";

export default function HomePage() {
  redirect(AUTH_CONFIG.homePath);
}
