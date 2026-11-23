import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max, "tooLong");

export const EMPLOYMENT_STATUSES = ["active", "on_leave", "terminated"] as const;

// All fields are strings so the same schema validates the form and the server action.
export const employeeSchema = z.object({
  employeeCode: optionalText(30),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  fullNameUr: optionalText(120),
  fatherName: optionalText(120),
  cnic: z.string().trim().regex(/^$|^\d{5}-?\d{7}-?\d$/, "invalidCnic"),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z.union([z.literal(""), z.email("invalidEmail")]),
  address: optionalText(300),
  department: optionalText(80),
  jobTitle: optionalText(80),
  hireDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "invalidDate"),
  status: z.enum(EMPLOYMENT_STATUSES),
  emergencyContact: optionalText(200),
  notes: optionalText(1000),
  salary: z.string().trim().regex(/^$|^\d{1,13}(\.\d{1,2})?$/, "invalidAmount"),
});

export type EmployeeValues = z.infer<typeof employeeSchema>;

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
