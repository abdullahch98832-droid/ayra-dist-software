import { z } from "zod";

const uuid = z.uuid("required");

export const inviteUserSchema = z.object({
  email: z.email("invalidEmail"),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  roleId: uuid,
  employeeId: z.union([z.uuid(), z.literal("")]),
});

export const userStatusSchema = z.object({
  userId: uuid,
  status: z.enum(["active", "suspended", "removed"]),
  roleId: z.union([z.uuid(), z.literal("")]),
});

export const roleSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, "invalidCode"),
  nameEn: z.string().trim().min(1, "required").max(80, "tooLong"),
  nameUr: z.string().trim().min(1, "required").max(80, "tooLong"),
  description: z.string().trim().max(300, "tooLong"),
});

export type InviteUserValues = z.infer<typeof inviteUserSchema>;
export type RoleValues = z.infer<typeof roleSchema>;
