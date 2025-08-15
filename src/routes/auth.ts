import { Router } from "express";
import * as authController from "@/controller/auth";
import { handleRequest, middlewares } from "@/services/request";
import { auth } from "@/controller/schemas";

export const router = Router();

router.post("/sign-up", middlewares.schema(auth.signUp), handleRequest(authController.signUp));
router.post("/login", handleRequest(authController.login));
router.get("/me", middlewares.auth, handleRequest(authController.me)); // Assuming getMe is defined in authController

export default router;