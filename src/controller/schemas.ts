import * as z from 'zod';

// Security: emails are compared case-insensitively everywhere (login, reset, Google linking,
// lockout), so they are normalized once here. Otherwise "Victim@x.com" and "victim@x.com" become
// two different accounts.
const emailSchema = z.string().trim().toLowerCase().email("Invalid email format").max(255);

// Security: Strong password requirements per OWASP guidelines.
// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
const passwordSchema = z.string()
    .min(12, "Password must be at least 12 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
    .refine(v => Buffer.byteLength(v, 'utf8') <= 72, "Password must not exceed 72 bytes");

export const auth = {
    signUp: z.object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().min(1, "Name is required").max(100),
        lastname: z.string().min(1, "Lastname is required").max(100),
        phone: z.string().min(10, "Phone number must be at least 10 characters long").max(20)
    }),
    login: z.object({
        email: emailSchema,
        password: z.string().min(1, "Password is required").max(128)
    }),
    refresh: z.object({
        refreshToken: z.string().optional() // Optional because it can come from cookie
    }),
    // Logout accepts a refresh token too (cookie or body) so it still works after the 2-minute access token expired
    logout: z.object({
        refreshToken: z.string().optional()
    }),
    passwordResetRequest: z.object({
        email: emailSchema
    }),
    passwordResetComplete: z.object({
        token: z.string().min(1, "Token is required").max(128),
        password: passwordSchema,
        current_password: z.string().min(1).max(128).optional() // Required only for the change-password flow (source: 'update')
    }),
    // Optional: MODULE_PASSWORD_CHANGE=true - email is taken from the authenticated session, not the body
    passwordResetUpdate: z.object({}),
    // Optional: MODULE_EMAIL_VERIFICATION=true
    resendVerificationByEmail: z.object({
        email: emailSchema
    }),
    // Optional: MODULE_GOOGLE_AUTH=true
    google: z.object({
        credential: z.string().min(1, "Google credential is required")
    })
}