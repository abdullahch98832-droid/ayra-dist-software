import "server-only";
import { createClient } from "@/lib/supabase/server";

export const EMPLOYEE_COLUMNS =
  "id, employee_code, full_name, full_name_ur, father_name, cnic, phone, whatsapp, email, address, department, job_title, hire_date, status, photo_path, emergency_contact, notes";

export type EmployeeRecord = {
  id: string;
  employee_code: string;
  full_name: string;
  full_name_ur: string | null;
  father_name: string | null;
  cnic: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  department: string | null;
  job_title: string | null;
  hire_date: string | null;
  status: "active" | "on_leave" | "terminated";
  photo_path: string | null;
  emergency_contact: string | null;
  notes: string | null;
};

/** Short-lived signed URLs for private employee photos. */
export async function signedPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  if (!wanted.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("employee-photos").createSignedUrls(wanted, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}
