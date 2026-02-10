/**
 * Auth Controller
 * 
 * Handles authentication endpoints with secure JWT implementation.
 * 
 * Security:
 * - Tokens signed with private key (RS256)
 * - Refresh token rotation with one-time use
 * - Reuse detection with session revocation
 */

import { BadRequest, InternalServerError, Unauthorized } from "@/services/errors";
import { SignUpBody, LoginBody, RefreshBody, PasswordResetRequestBody, PasswordResetCompleteBody } from "@/types/controllers/auth";
import { AppRequest } from "@/types/requests";
import { Response } from "express";
import { comparePasswords, hashPassword, generateTokenSet, verifyRefreshToken, generateAccessToken, generateRefreshToken, getJWKS, getSidExpirationSQL, clearSidFromCookies, createPasswordResetRequest, completePasswordReset } from "@/services/auth";
import { InsertUserDB } from "@/types/db/users";
import { tokens as tokenConfig, auth as authConfig } from "@/config";
import { v4 as uuidv4 } from "uuid";
import { getUserByEmail, getUserById, UserDataWithPassword } from "@/data/users";
import {
    createSession,
    revokeSession,
    revokeAllUserSessions,
    getActiveSession,
    getSessionByRefreshJti,
    rotateRefreshToken
} from "@/data/user-sessions";
import RedisSingleton from "@/services/redis";
import { checkLockout, recordFailedAttempt, clearLockout } from "@/services/security";
import { Audit } from "@/services/audit";


export const signUp = async (req: AppRequest<SignUpBody>) => {
    const { body, db } = req;

    const userExists = await db!.find("users", { email: body.email });
    if (userExists.length > 0) {
        throw new BadRequest("User already exists", [{ key: "email", message: "Email is already registered" }]);
    }

    body.password = hashPassword(body.password);

    const newUser: InsertUserDB = {
        ...body,
        disabled: false
    };

    const userRes = await db!.insert("users", [newUser]);

    if (userRes.length === 0)
        throw new InternalServerError("Failed to create user. Please try again later.")

    const { password, ...userWithoutPassword } = userRes[0];

    // Audit: Log signup
    const auditCtx = Audit.getContextFromRequest(req);
    Audit.signup(db!, userRes[0].id, body.email, auditCtx);

    return userWithoutPassword;
};

export const login = async (req: AppRequest<LoginBody>, res: Response) => {
    const { db, body } = req;

    // Get client IP (respects X-Forwarded-For behind proxy)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || req.socket.remoteAddress 
        || undefined;

    // Security: Check if account or IP is locked out
    const lockoutStatus = await checkLockout(body.email, clientIp);
    if (lockoutStatus.locked) {
        const minutesRemaining = Math.ceil(
            (lockoutStatus.lockoutEndsAt!.getTime() - Date.now()) / 60000
        );
        const reason = lockoutStatus.lockedBy === 'ip' 
            ? 'Too many failed attempts from this IP.' 
            : 'Too many failed attempts for this account.';
        throw new BadRequest(
            "Account temporarily locked",
            { message: `${reason} Try again in ${minutesRemaining} minutes.` }
        );
    }

    const user = await getUserByEmail(db!)(body.email, true) as UserDataWithPassword;

    if (!user || !comparePasswords(body.password, user.password)) {
        // Security: Record failed attempt for email AND IP
        const attemptResult = await recordFailedAttempt(body.email, clientIp);
        
        // Audit: Log failed login
        const auditCtx = Audit.getContextFromRequest(req);
        Audit.loginFailed(db!, body.email, auditCtx, 'invalid_credentials');
        
        if (attemptResult.locked) {
            Audit.accountLocked(db!, body.email, auditCtx, attemptResult.lockedBy || 'email');
            throw new BadRequest(
                "Account temporarily locked",
                { message: "Too many failed attempts. Your account has been temporarily locked." }
            );
        }
        
        throw new BadRequest("Invalid credentials", { 
            message: "Invalid credentials",
            attemptsRemaining: attemptResult.attemptsRemaining 
        });
    }

    // Security: Clear email lockout on successful login (IP lockout persists)
    await clearLockout(body.email);

    // Audit: Log successful login
    const auditCtx = Audit.getContextFromRequest(req);
    Audit.loginSuccess(db!, user.user_id, body.email, auditCtx);

    const sid = uuidv4();
    const { password, ...userWithoutPassword } = user;

    // Generate new token set
    const { accessToken, refreshToken, refreshJti, idToken } = generateTokenSet(sid, userWithoutPassword);

    // Create session in database
    await createSession(db!)(sid, user.user_id, refreshJti, getSidExpirationSQL());

    // Handle response based on auth mode
    if (authConfig.mode === 'bearer') {
        return {
            user: userWithoutPassword,
            accessToken,
            refreshToken,
            idToken,
        };
    } else {
        // Cookie mode: set HTTP-only cookies
        setTokenCookies(res, { accessToken, refreshToken, idToken });
        return userWithoutPassword;
    }
};

/**
 * Refresh endpoint - rotates refresh token
 * 
 * Security:
 * - Validates refresh token with public key
 * - Checks JTI against database (one-time use)
 * - Generates new refresh token with new JTI
 * - Detects reuse and revokes entire session family
 */
export const refresh = async (req: AppRequest<RefreshBody>, res: Response) => {
    const { db, body } = req;

    // Get refresh token from cookie (preferred) or body
    let refreshTokenStr = req.cookies?.[tokenConfig.names.refresh];
    if (!refreshTokenStr && body?.refreshToken) {
        refreshTokenStr = body.refreshToken;
    }

    if (!refreshTokenStr) {
        throw new Unauthorized("Refresh token required", "MISSING_REFRESH_TOKEN");
    }

    // Verify refresh token (validates signature, exp, etc.)
    let payload;
    try {
        payload = verifyRefreshToken(refreshTokenStr);
    } catch (error) {
        throw new Unauthorized("Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }

    const { sid, sub: userId, jti } = payload;

    // Check if JTI is valid (one-time use)
    const session = await getSessionByRefreshJti(db!)(jti);

    if (!session) {
        // JTI not found - possible reuse attack!
        // Check if session exists with different JTI (token was already rotated)
        const existingSession = await getActiveSession(db!)(sid);

        if (existingSession && existingSession.refresh_jti !== jti) {
            // REUSE DETECTED: This token was already used and rotated
            console.warn(`[SECURITY] Refresh token reuse detected for session ${sid}. Revoking all user sessions.`);

            // Audit: Log token reuse detection
            const auditCtx = Audit.getContextFromRequest(req);
            Audit.tokenReuseDetected(db!, userId, auditCtx, sid);

            // Revoke all sessions for this user (nuclear option)
            await revokeAllUserSessions(db!)(userId, 'token_reuse');

            // Invalidate cache
            const redis = RedisSingleton.getInstance();
            if (await RedisSingleton.ping()) {
                await redis.del(`session:${sid}`);
                await redis.del(`user:${userId}`);
            }

            throw new Unauthorized("Session compromised", "TOKEN_REUSE_DETECTED");
        }

        throw new Unauthorized("Invalid session", "SESSION_NOT_FOUND");
    }

    // Verify session is for the correct user
    if (session.user_id !== userId) {
        throw new Unauthorized("Invalid session", "SESSION_USER_MISMATCH");
    }

    // Load user data
    const user = await getUserById(db!)(userId);
    if (!user) {
        throw new Unauthorized("User not found", "USER_NOT_FOUND");
    }

    // Generate new tokens with new JTI (rotation)
    const newAccessToken = generateAccessToken(sid, user);
    const { token: newRefreshToken, jti: newJti } = generateRefreshToken(sid, userId);

    // Update session with new JTI
    await rotateRefreshToken(db!)(sid, newJti);

    // Audit: Log token refresh
    const auditCtx = Audit.getContextFromRequest(req);
    Audit.tokenRefresh(db!, userId, auditCtx);

    // Update cache
    const redis = RedisSingleton.getInstance();
    if (await RedisSingleton.ping()) {
        await redis.set(`session:${sid}`, 'active', 'EX', 600);
    }

    // Return based on mode
    if (authConfig.mode === 'bearer') {
        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    } else {
        // Set new cookies
        setTokenCookies(res, {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            idToken: undefined // ID token not refreshed here
        });
        return { success: true };
    }
};

export const logout = async (req: AppRequest, res: Response) => {
    const { db, user, sessionId } = req;

    if (!user || !sessionId) {
        return { success: true };
    }

    // Audit: Log logout
    const auditCtx = Audit.getContextFromRequest(req);
    Audit.logout(db!, user.user_id, auditCtx);

    // Revoke session
    await revokeSession(db!)(sessionId, 'logout');

    // Invalidate cache
    const redis = RedisSingleton.getInstance();
    if (await RedisSingleton.ping()) {
        await redis.del(`session:${sessionId}`);
    }

    // Clear cookies if in cookie mode
    if (authConfig.mode === 'cookies') {
        clearSidFromCookies(res);
    }

    return { success: true };
};

export const me = async (req: AppRequest<LoginBody>) => {
    return req.user;
};

/**
 * JWKS endpoint for public key distribution
 */
export const jwks = async () => {
    return getJWKS();
};

/**
 * Request password reset
 * Always returns success to prevent email enumeration
 */
export const requestPasswordReset = async (req: AppRequest<PasswordResetRequestBody>) => {
    const { db, body } = req;

    // Audit: Log password reset request
    const auditCtx = Audit.getContextFromRequest(req);
    Audit.passwordResetRequest(db!, body.email, auditCtx);

    // Create reset token (returns even if email doesn't exist)
    const result = await createPasswordResetRequest(db!, body.email);

    // In production, remove token from response and send via email
    return { 
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.',
        // DEV ONLY - remove in production:
        ...(process.env.NODE_ENV !== 'production' && result.token && { token: result.token })
    };
};

/**
 * Complete password reset with token
 */
export const resetPassword = async (req: AppRequest<PasswordResetCompleteBody>) => {
    const { db, body } = req;

    await completePasswordReset(db!, body.token, body.password);

    // Audit: Password reset completion is logged inside completePasswordReset
    // since it has access to the user_id from the token validation
    
    return { 
        success: true,
        message: 'Password has been reset. Please log in with your new password.'
    };
};

// Helper functions

/**
 * Sets token cookies with security flags
 */
const setTokenCookies = (
    res: Response,
    tokens: { accessToken: string; refreshToken: string; idToken?: string }
) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
    };

    res.cookie(tokenConfig.names.access, tokens.accessToken, {
        ...cookieOptions,
        maxAge: tokenConfig.expiry.access,
    });

    res.cookie(tokenConfig.names.refresh, tokens.refreshToken, {
        ...cookieOptions,
        maxAge: tokenConfig.expiry.refresh,
        path: '/api/v1/auth/refresh', // Restrict refresh token to refresh endpoint
    });

    if (tokens.idToken) {
        res.cookie(tokenConfig.names.id, tokens.idToken, {
            ...cookieOptions,
            maxAge: tokenConfig.expiry.id,
        });
    }
};