import * as z from 'zod';

// Security: Strong password requirements per OWASP guidelines
const passwordSchema = z.string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const auth = {
    signUp: z.object({
        email: z.string().email("Invalid email format").max(255),
        password: passwordSchema,
        name: z.string().min(1, "Name is required").max(100),
        lastname: z.string().min(1, "Lastname is required").max(100),
        phone: z.string().min(10, "Phone number must be at least 10 characters long").max(20)
    }),
    login: z.object({
        email: z.string().email("Invalid email format").max(255),
        password: z.string().min(1, "Password is required").max(128)
    }),
    refresh: z.object({
        refreshToken: z.string().optional() // Optional because it can come from cookie
    }),
    passwordResetRequest: z.object({
        email: z.string().email("Invalid email format").max(255)
    }),
    passwordResetComplete: z.object({
        token: z.string().min(1, "Token is required").max(128),
        password: passwordSchema
    })
}