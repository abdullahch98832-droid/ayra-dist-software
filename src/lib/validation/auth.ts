import { z } from "zod";

// Messages are dictionary keys (see errors.* and auth.* in src/i18n).
export const loginSchema = z.object({
  email: z.email("invalidEmail"),
  password: z.string().min(1, "required"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("invalidEmail"),
});

export const setPasswordSchema = z
  .object({
    password: z.string().min(10, "passwordTooShort").max(128, "tooLong"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "passwordsDontMatch", path: ["confirm"] });

export type LoginValues = z.infer<typeof loginSchema>;
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
