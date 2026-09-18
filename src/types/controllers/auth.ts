import * as z from "zod";
import { auth } from "@/controller/schemas";

export type SignUpBody = z.infer<typeof auth.signUp>;
export type LoginBody = z.infer<typeof auth.login>;
export type LogoutBody = z.infer<typeof auth.logout>;
export type RefreshBody = z.infer<typeof auth.refresh>;
export type PasswordResetRequestBody = z.infer<typeof auth.passwordResetRequest>;
export type PasswordResetCompleteBody = z.infer<typeof auth.passwordResetComplete>;
export type PasswordResetUpdateBody = z.infer<typeof auth.passwordResetUpdate>;
export type ResendVerificationByEmailBody = z.infer<typeof auth.resendVerificationByEmail>;
export type GoogleLoginBody = z.infer<typeof auth.google>;