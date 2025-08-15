import * as z from 'zod';

export const auth = {
    signUp: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters long"),
        name: z.string().min(1, "Name is required"),
        lastname: z.string().min(1, "Lastname is required"),
        phone: z.string().min(10, "Phone number must be at least 10 characters long")
    }),
    login: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters long")
    })
}