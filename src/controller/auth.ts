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

import { BadRequest, InternalServerError, TooManyRequests, Unauthorized } from "@/services/errors";
import {
    SignUpBody,
    LoginBody,
    LogoutBody,
    RefreshBody,
    PasswordResetRequestBody,
    PasswordResetCompleteBody,
    PasswordResetUpdateBody,
    ResendVerificationByEmailBody,
    GoogleLoginBody
} from "@/types/controllers/auth";
import { AppRequest } from "@/types/requests";
import { AccessTokenPayload } from "@/types/auth";
import { Response } from "express";
import {
    comparePasswords,
    hashPassword,
    generateTokenSet,
    verifyToken,
    verifyRefreshToken,
    generateAccessToken,
    generateRefreshToken,
    getJWKS,
    getSidExpirationSQL,
    clearSidFromCookies,
    createPasswordResetRequest,
    completePasswordReset,
    initiateEmailVerification,
    completeEmailVerification,
    verifyGoogleIdToken
} from "@/services/auth";
import { getAccessToken } from "@/services/auth/auth-middleware";
import { InsertUserDB } from "@/types/db/users";
import { app as appConfig, tokens as tokenConfig, auth as authConfig, modules } from "@/config";
import { v4 as uuidv4 } from "uuid";
import { getUserByEmail, getUserById, UserDataWithPassword } from "@/data/users";
import { getIdentityByProviderId, linkIdentity, touchIdentityLogin } from "@/data/user-identities";
import {
    createSession,
    revokeSession,
    revokeAllUserSessions,
    getActiveSession,
    getSessionByRefreshJti,
    rotateRefreshToken
} from "@/data/user-sessions";
import { checkLockout, recordFailedAttempt, clearLockout, hashJti } from "@/services/security";
import { Audit } from "@/services/audit";
import { logger } from "@/services/logger";
import { UserTokenData } from "@/types/data/users";

// Same response whether or not the email was already registered (see signUp)
const SIGN_UP_PENDING_VERIFICATION = {
    success: true,
    message: 'If this email can be registered, we sent a link to verify it.'
};

export const signUp = async (req: AppRequest<SignUpBody>) => {
    const { body, db } = req;

    // Hash BEFORE looking the email up, so the response time doesn't reveal whether it exists
    const passwordHash = await hashPassword(body.password);

    const userExists = await db!.find("users", { email: body.email });
    if (userExists.length > 0) {
        // With email verification on, the response can't tell the caller the email is taken:
        // the real owner is not notified here, but nothing leaks either.
        if (modules.emailVerification) return SIGN_UP_PENDING_VERIFICATION;
        throw new BadRequest("User already exists", [{ key: "email", message: "Email is already registered" }]);
    }

    // Security: build the row field by field - never spread the request body into an insert
    const newUser: InsertUserDB = {
        email: body.email,
        password: passwordHash,
        name: body.name,
        lastname: body.lastname,
        phone: body.phone,
        disabled: false
    };

    const userRes = await db!.insert("users", [newUser]);

    if (userRes.length === 0)
        throw new InternalServerError("Failed to create user. Please try again later.")

    const { password, ...userWithoutPassword } = userRes[0];

    // Audit: Log signup
    const auditCtx = Audit.getContextFromRequest(req);
    await Audit.signup(db!, userRes[0].id, body.email, auditCtx);

    if (modules.emailVerification) {
        await initiateEmailVerification(db!, userRes[0].id, body.email);
        return SIGN_UP_PENDING_VERIFICATION;
    }

    return userWithoutPassword;
};

export const login = async (req: AppRequest<LoginBody>, res: Response) => {
    const { db, body } = req;

    // Client IP as resolved by Express (honors the configured trust proxy hops, not raw headers)
    const clientIp = req.ip || undefined;

    // Security: Check if this account-from-this-IP, or the IP itself, is locked out
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

    const user = await getUserByEmail(db!)(body.email, true) as UserDataWithPassword | null;

    // Always runs a bcrypt comparison (against a dummy hash when there is no user or no password),
    // so neither timing nor an exception tells an attacker which emails exist.
    const passwordOk = await comparePasswords(body.password, user?.password);

    if (!user || !passwordOk) {
        // Security: Record failed attempt for email AND IP
        const attemptResult = await recordFailedAttempt(body.email, clientIp);

        // Audit: Log failed login
        const auditCtx = Audit.getContextFromRequest(req);
        await Audit.loginFailed(db!, body.email, auditCtx, 'invalid_credentials');

        if (attemptResult.locked) {
            await Audit.accountLocked(db!, body.email, auditCtx, attemptResult.lockedBy || 'email');
            // persist(): the request fails, but the audit rows above must be kept
            throw new BadRequest(
                "Account temporarily locked",
                { message: "Too many failed attempts. Your account has been temporarily locked." }
            ).persist();
        }

        throw new BadRequest("Invalid credentials", {
            message: "Invalid credentials",
            attemptsRemaining: attemptResult.attemptsRemaining
        }).persist();
    }

    // Security: Email verification gate (Optional: MODULE_EMAIL_VERIFICATION=true)
    if (modules.emailVerification && !user.email_verified_at) {
        throw new BadRequest("Email not verified", { message: "Please verify your email before logging in.", code: "EMAIL_NOT_VERIFIED" });
    }

    // Security: Clear this account's lockout on successful login (IP lockout persists)
    await clearLockout(body.email, clientIp);

    // Audit: Log successful login
    const auditCtx = Audit.getContextFromRequest(req);
    await Audit.loginSuccess(db!, user.user_id, body.email, auditCtx);

    const { password, ...userWithoutPassword } = user;

    return issueSession(req, res, userWithoutPassword);
};

/**
 * Verifies a Google ID token and logs in (or provisions) the matching user.
 * Optional: MODULE_GOOGLE_AUTH=true
 */
export const googleLogin = async (req: AppRequest<GoogleLoginBody>, res: Response) => {
    const { db, body } = req;
    const auditCtx = Audit.getContextFromRequest(req);

    const identity = await verifyGoogleIdToken(body.credential);

    const existingIdentity = await getIdentityByProviderId(db!)('google', identity.sub);

    let userId: string;

    if (existingIdentity) {
        userId = existingIdentity.user_id;
        await touchIdentityLogin(db!)(existingIdentity.id);
    } else {
        const existingUser = await getUserByEmail(db!)(identity.email, false);

        if (existingUser) {
            userId = existingUser.user_id;

            if (!existingUser.email_verified_at) {
                // Pre-hijacking defense. This local account's email was never verified, so whoever
                // registered it may not be the owner: an attacker can sign up with a victim's email
                // and a password they know, then wait for the victim to "Sign in with Google".
                // Google has just proven this email belongs to the person signing in, so the account
                // is theirs - but everything the earlier registrant could still use to get back in
                // (password, reset/verification tokens, live sessions) must die first.
                await db!.query(
                    `UPDATE users
                     SET password = NULL,
                         email_verified_at = NOW(),
                         email_verification_token = NULL,
                         email_verification_sent_at = NULL,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [userId]
                );
                await db!.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
                await revokeAllUserSessions(db!)(userId, 'password_change');
            }

            await linkIdentity(db!)(userId, 'google', identity.sub, identity.email);
        } else {
            const [firstName, ...rest] = (identity.name || identity.email.split('@')[0]).split(' ');
            const newUser: InsertUserDB = {
                name: firstName || null,
                lastname: rest.join(' ') || null,
                phone: null,
                email: identity.email,
                password: null,
                disabled: false,
            };
            const [created] = await db!.insert('users', [newUser]);
            userId = created.id;

            await db!.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [userId]);
            await linkIdentity(db!)(userId, 'google', identity.sub, identity.email);

            await Audit.signup(db!, userId, identity.email, auditCtx);
        }

        await Audit.providerConnected(db!, userId, 'google', { ...auditCtx, email: identity.email });
    }

    const user = await getUserById(db!)(userId);
    // getUserById filters disabled users: a disabled account must not get a session
    if (!user) throw new Unauthorized('Account unavailable', 'ACCOUNT_UNAVAILABLE');

    await Audit.loginSuccess(db!, userId, identity.email, auditCtx);

    return issueSession(req, res, user);
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

        // The stored JTI is a SHA-256 hash, so compare against the hash of the presented one
        if (existingSession && existingSession.user_id === userId && existingSession.refresh_jti !== hashJti(jti)) {
            // REUSE DETECTED: This token was already used and rotated
            logger.warn('security', `Refresh token reuse detected for session ${sid}. Revoking all user sessions.`);

            // Audit: Log token reuse detection
            const auditCtx = Audit.getContextFromRequest(req);
            await Audit.tokenReuseDetected(db!, userId, auditCtx, sid);

            // Revoke all sessions for this user (nuclear option)
            await revokeAllUserSessions(db!)(userId, 'token_reuse');

            // persist(): this request fails with 401, but handleRequest would normally roll the
            // transaction back - undoing the revocation and the audit row above, which is the whole
            // point of reuse detection.
            throw new Unauthorized("Session compromised", "TOKEN_REUSE_DETECTED").persist();
        }

        throw new Unauthorized("Invalid session", "SESSION_NOT_FOUND");
    }

    // Verify session is for the correct user
    if (session.user_id !== userId || session.sid !== sid) {
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

    // Atomic rotation: only succeeds while the session still holds the JTI we were given.
    // If a concurrent request already rotated it, this one loses and gets no tokens.
    const rotated = await rotateRefreshToken(db!)(sid, jti, newJti);
    if (!rotated) {
        throw new Unauthorized("Refresh token already used", "REFRESH_CONFLICT");
    }

    // Audit: Log token refresh
    const auditCtx = Audit.getContextFromRequest(req);
    await Audit.tokenRefresh(db!, userId, auditCtx);

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

/**
 * Works with an expired access token: the access token lives only 2 minutes, and a user must be
 * able to end their session after that. Identity comes from a validly SIGNED token (access token
 * with expiry ignored, or the refresh token), never from unsigned input.
 */
const resolveLogoutSession = (req: AppRequest<LogoutBody>): { sid: string; userId: string } | null => {
    const accessToken = getAccessToken(req);
    if (accessToken) {
        try {
            const payload = verifyToken<AccessTokenPayload>(accessToken, { ignoreExpiration: true });
            if (payload.typ === 'access') return { sid: payload.sid, userId: payload.sub };
        } catch {
            // fall through to the refresh token
        }
    }

    const refreshToken = req.cookies?.[tokenConfig.names.refresh] || req.body?.refreshToken;
    if (refreshToken) {
        try {
            const payload = verifyRefreshToken(refreshToken);
            return { sid: payload.sid, userId: payload.sub };
        } catch {
            // invalid token: nothing to revoke
        }
    }

    return null;
};

export const logout = async (req: AppRequest<LogoutBody>, res: Response) => {
    const { db } = req;

    const identity = resolveLogoutSession(req);
    if (identity) {
        const auditCtx = Audit.getContextFromRequest(req);
        await revokeSession(db!)(identity.sid, 'logout');
        await Audit.logout(db!, identity.userId, auditCtx);
    }

    // Clear cookies if in cookie mode (even if there was nothing to revoke)
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
    await Audit.passwordResetRequest(db!, body.email, auditCtx);

    // Create reset token (returns even if email doesn't exist)
    const result = await createPasswordResetRequest(db!, body.email);

    return {
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.',
        // DEV ONLY: the service only returns a token when NODE_ENV is development/local/test
        ...(appConfig.isDev && result.token && { token: result.token })
    };
};

/**
 * Complete password reset with token
 * Also used to complete the change-password flow (source: 'update'), where
 * body.current_password is required and re-verified.
 */
export const resetPassword = async (req: AppRequest<PasswordResetCompleteBody>) => {
    const { db, body } = req;

    const auditCtx = Audit.getContextFromRequest(req);
    await completePasswordReset(db!, body.token, body.password, body.current_password, auditCtx);

    // Audit: Password reset/change completion is logged inside completePasswordReset
    // since it has access to the user_id and source from the token validation

    return {
        success: true,
        message: 'Password has been reset. Please log in with your new password.'
    };
};

/**
 * Requests a password change while logged in - emails a confirmation token
 * scoped to the change-password flow (source: 'update'), completed via
 * POST /password-reset/complete with token + current_password.
 * Optional: MODULE_PASSWORD_CHANGE=true
 */
export const requestPasswordUpdate = async (req: AppRequest<PasswordResetUpdateBody>) => {
    const { db, user } = req;

    const auditCtx = Audit.getContextFromRequest(req);
    await Audit.passwordResetRequest(db!, user!.email, { ...auditCtx, metadata: { source: 'update' } });

    const result = await createPasswordResetRequest(db!, user!.email, 'update');

    return {
        success: true,
        message: 'Check your email to confirm the password change.',
        ...(appConfig.isDev && result.token && { token: result.token })
    };
};

/**
 * Completes email verification with a token
 * Optional: MODULE_EMAIL_VERIFICATION=true
 */
export const verifyEmail = async (req: AppRequest<{ token?: string }>) => {
    // ?token=a&token=b or ?token[x]=y arrive as arrays/objects - only a plain string is a token
    const raw = req.query.token ?? req.body?.token;
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
        throw new BadRequest('Verification token is required');
    }

    const { db } = req;
    await completeEmailVerification(db!, raw);

    return { success: true, message: 'Email verified. You can now log in.' };
};

/**
 * Resends the verification email for the currently authenticated user
 * Optional: MODULE_EMAIL_VERIFICATION=true
 */
export const resendVerificationEmail = async (req: AppRequest) => {
    const { db, user } = req;
    if (!user) throw new Unauthorized('Not authenticated');

    const sent = await initiateEmailVerification(db!, user.user_id, user.email);
    if (!sent) {
        throw new TooManyRequests('Please wait a minute before requesting another verification email.');
    }

    return { success: true, message: 'Verification email sent.' };
};

/**
 * Resends the verification email by address (no auth required)
 * Always returns success to prevent email enumeration
 * Optional: MODULE_EMAIL_VERIFICATION=true
 */
export const resendVerificationEmailByEmail = async (req: AppRequest<ResendVerificationByEmailBody>) => {
    const { db, body } = req;

    const user = await getUserByEmail(db!)(body.email, false);
    if (user && !user.email_verified_at) {
        // A cooldown hit is silently ignored: the response must be identical either way
        await initiateEmailVerification(db!, user.user_id, user.email);
    }

    return { success: true, message: 'If an account exists with this email, a verification link has been sent.' };
};

// Helper functions

/**
 * Generates a token set, creates the session, and returns the response
 * shaped for the configured auth mode. Shared by login and googleLogin.
 */
const issueSession = async (req: AppRequest, res: Response, user: UserTokenData) => {
    const { db } = req;
    const sid = uuidv4();

    const { accessToken, refreshToken, refreshJti, idToken } = generateTokenSet(sid, user);

    await createSession(db!)(sid, user.user_id, refreshJti, getSidExpirationSQL());

    if (authConfig.mode === 'bearer') {
        return { user, accessToken, refreshToken, idToken };
    }

    setTokenCookies(res, { accessToken, refreshToken, idToken });
    return user;
};

/**
 * Sets token cookies with security flags
 */
const setTokenCookies = (
    res: Response,
    tokens: { accessToken: string; refreshToken: string; idToken?: string }
) => {
    const cookieOptions = {
        httpOnly: true,
        // Fail closed: only development/local/test may use non-Secure cookies
        secure: !appConfig.isDev,
        sameSite: 'strict' as const,
    };

    res.cookie(tokenConfig.names.access, tokens.accessToken, {
        ...cookieOptions,
        maxAge: tokenConfig.expiry.access,
    });

    res.cookie(tokenConfig.names.refresh, tokens.refreshToken, {
        ...cookieOptions,
        maxAge: tokenConfig.expiry.refresh,
        path: tokenConfig.refreshCookiePath, // Only sent to /auth/* (refresh + logout)
    });

    if (tokens.idToken) {
        res.cookie(tokenConfig.names.id, tokens.idToken, {
            ...cookieOptions,
            maxAge: tokenConfig.expiry.id,
        });
    }
};
