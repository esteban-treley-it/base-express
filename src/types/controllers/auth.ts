import * as z from "zod";
import { auth } from "@/controller/schemas";

export type SignUpBody = z.infer<typeof auth.signUp>;
export type LoginBody = z.infer<typeof auth.login>;
export type RefreshBody = z.infer<typeof auth.refresh>;
export type PasswordResetRequestBody = z.infer<typeof auth.passwordResetRequest>;
export type PasswordResetCompleteBody = z.infer<typeof auth.passwordResetComplete>;