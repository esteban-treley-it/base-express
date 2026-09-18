import { Router } from "express";
import * as authController from "@/controller/auth";
import { handleRequest, middlewares } from "@/services/request";
import { auth } from "@/controller/schemas";
import { modules, google as googleConfig } from "@/config";
import { logger } from "@/services/logger";

export const router = Router();

router.post("/sign-up", middlewares.schema(auth.signUp), handleRequest(authController.signUp));
// Security: Added schema validation to prevent injection and malformed data
router.post("/login", middlewares.schema(auth.login), handleRequest(authController.login));
router.post("/refresh", middlewares.schema(auth.refresh), handleRequest(authController.refresh));
router.get("/me", middlewares.auth, handleRequest(authController.me));
// Logout is NOT behind middlewares.auth: the access token lives 2 minutes, and a user whose token
// expired must still be able to end the session. The controller derives the session from a signed
// access token (expiry ignored) or the refresh token.
router.post("/logout", middlewares.schema(auth.logout), handleRequest(authController.logout));

// Password reset endpoints (no auth required)
router.post("/password-reset/request", middlewares.schema(auth.passwordResetRequest), handleRequest(authController.requestPasswordReset));
router.post("/password-reset/complete", middlewares.schema(auth.passwordResetComplete), handleRequest(authController.resetPassword));

// JWKS endpoint for public key distribution (no auth required)
router.get("/.well-known/jwks.json", handleRequest(authController.jwks));

// Email verification (Optional: MODULE_EMAIL_VERIFICATION=true)
if (modules.emailVerification) {
    router.get("/verify-email", handleRequest(authController.verifyEmail));
    router.post("/verify-email/resend", middlewares.auth, handleRequest(authController.resendVerificationEmail));
    router.post("/verify-email/resend-by-email", middlewares.schema(auth.resendVerificationByEmail), handleRequest(authController.resendVerificationEmailByEmail));
}

// Google Sign-In (Optional: MODULE_GOOGLE_AUTH=true, requires GOOGLE_CLIENT_ID)
if (modules.googleAuth) {
    if (googleConfig.clientId) {
        router.post("/google", middlewares.schema(auth.google), handleRequest(authController.googleLogin));
    } else {
        logger.warn('routes', 'MODULE_GOOGLE_AUTH is enabled but GOOGLE_CLIENT_ID is empty - /auth/google will not be mounted.');
    }
}

// Change password while logged in (Optional: MODULE_PASSWORD_CHANGE=true)
// No body expected - the email comes from the authenticated session.
if (modules.passwordChange) {
    router.post("/password-reset/update", middlewares.auth, handleRequest(authController.requestPasswordUpdate));
}

export default router;