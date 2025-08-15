import * as z from "zod";
import { auth } from "@/controller/schemas";

export type SignUpBody = z.infer<typeof auth.signUp>;
export type LoginBody = z.infer<typeof auth.login>;