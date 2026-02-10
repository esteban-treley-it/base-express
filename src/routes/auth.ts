import { Router } from "express";
import * as authController from "@/controller/auth";
import { handleRequest, middlewares } from "@/services/request";
import { auth } from "@/controller/schemas";

export const router = Router();

router.post("/sign-up", middlewares.schema(auth.signUp), handleRequest(authController.signUp));
// Security: Added schema validation to prevent injection and malformed data
router.post("/login", middlewares.schema(auth.login), handleRequest(authController.login));
router.post("/refresh", middlewares.schema(auth.refresh), handleRequest(authController.refresh));
router.get("/me", middlewares.auth, handleRequest(authController.me));
router.post("/logout", middlewares.auth, handleRequest(authController.logout));

// Password reset endpoints (no auth required)
router.post("/password-reset/request", middlewares.schema(auth.passwordResetRequest), handleRequest(authController.requestPasswordReset));
router.post("/password-reset/complete", middlewares.schema(auth.passwordResetComplete), handleRequest(authController.resetPassword));

// JWKS endpoint for public key distribution (no auth required)
router.get("/.well-known/jwks.json", handleRequest(authController.jwks));

export default router;