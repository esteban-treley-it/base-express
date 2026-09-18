/**
 * Password Reset Service
 * 
 * Secure password reset flow:
 * 1. User requests reset with email
 * 2. Secure token generated (crypto.randomBytes)
 * 3. Token hash stored in DB with expiration
 * 4. Token sent via email (placeholder - needs email service)
 * 5. User submits new password with token
 * 6. Token validated, password updated, sessions revoked
 */

import crypto from 'crypto';
import DB from '../db';
import { hashPassword, comparePasswords } from './auth';
import { revokeAllUserSessions } from '@/data/user-sessions';
import { BadRequest } from '../errors';
import { InsertPasswordResetTokenDB, PasswordResetSource } from '@/types/db/password_reset_tokens';
import { sendPasswordResetEmail } from '../email';
import { logger } from '../logger';
import { Audit, AuditContext } from '@/services/audit';
import { app as appConfig } from '@/config';

// Configuration
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_BYTES = 32; // 256 bits of entropy
const RESET_COOLDOWN_SECONDS = 60; // min time between reset emails per user

/**
 * Generates a secure reset token
 * Returns both the raw token (for email) and hash (for storage)
 */
const generateResetToken = (): { token: string; hash: string } => {
    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
};

/**
 * Hashes a token for lookup
 */
const hashToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Creates a password reset request
 * Returns the token to be sent via email
 * 
 * Note: Always returns success even if email doesn't exist (prevents enumeration)
 */
export const createPasswordResetRequest = async (
    db: DB,
    email: string,
    source: PasswordResetSource = 'forgot'
): Promise<{ success: true; token?: string }> => {
    // Find user (but don't reveal if exists)
    const [user] = await db.query<{ user_id: string }[]>(
        'SELECT id AS user_id FROM users WHERE email = $1 AND disabled = false',
        [email.toLowerCase()]
    );

    if (!user) {
        // Return success anyway to prevent email enumeration
        return { success: true };
    }

    // Cooldown: without it anyone can (a) flood a victim's inbox and (b) keep invalidating the
    // victim's still-valid reset link by requesting a new one over and over.
    const [recent] = await db.query<{ id: string }[]>(
        `SELECT id FROM password_reset_tokens
         WHERE user_id = $1 AND used_at IS NULL
           AND created_at > NOW() - make_interval(secs => $2)`,
        [user.user_id, RESET_COOLDOWN_SECONDS]
    );
    if (recent) {
        return { success: true };
    }

    // Invalidate any existing tokens for this user
    await db.query(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [user.user_id]
    );

    // Generate new token
    const { token, hash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();

    // Store token hash
    const entry: InsertPasswordResetTokenDB = {
        user_id: user.user_id,
        token_hash: hash,
        source,
        expires_at: expiresAt,
    };

    await db.insert('password_reset_tokens', [entry]);

    // Not awaited on purpose: waiting for the mail provider only when the account exists would make
    // the response time reveal which emails are registered. sendEmail never throws.
    void sendPasswordResetEmail(email.toLowerCase(), token, source).catch(() => undefined);
    if (appConfig.isDev) {
        logger.info('password-reset', `Token generated for ${email} (source: ${source}): ${token}`);
    }

    // DEV ONLY (fail closed: NODE_ENV must be development/local/test): the token is returned so
    // the flow can be exercised without an email provider. Never returned otherwise.
    return { success: true, ...(appConfig.isDev && { token }) };
};

/**
 * Validates a password reset token
 * Returns user_id if valid
 */
export const validateResetToken = async (
    db: DB,
    token: string
): Promise<{ valid: boolean; userId?: string; source?: PasswordResetSource }> => {
    const hash = hashToken(token);

    const [record] = await db.query<{ user_id: string; source: PasswordResetSource }[]>(
        `SELECT user_id, source
         FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [hash]
    );

    if (!record) {
        return { valid: false };
    }

    return { valid: true, userId: record.user_id, source: record.source };
};

/**
 * Completes password reset
 * Updates password and revokes all sessions
 */
export const completePasswordReset = async (
    db: DB,
    token: string,
    newPassword: string,
    currentPassword?: string,
    auditCtx: Partial<AuditContext> = {}
): Promise<void> => {
    const hash = hashToken(token);

    // Consume the token in a single atomic statement. A SELECT-then-UPDATE lets two concurrent
    // requests both see the token as unused and both succeed; here the second one blocks on the
    // row lock, re-evaluates "used_at IS NULL" and matches nothing.
    // If a later check fails the request throws and the transaction rolls back, un-consuming it.
    const [record] = await db.query<{ user_id: string; source: PasswordResetSource }[]>(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id, source`,
        [hash]
    );
    if (!record) {
        throw new BadRequest('Invalid or expired reset token');
    }
    const validation = { userId: record.user_id, source: record.source };

    // Change-password flow (MODULE_PASSWORD_CHANGE): re-verify the current password
    // before allowing the change, even though the token already proves email access.
    if (validation.source === 'update') {
        if (!currentPassword) {
            throw new BadRequest('Current password is required');
        }
        const [user] = await db.query<{ password: string | null }[]>(
            'SELECT password FROM users WHERE id = $1',
            [validation.userId]
        );
        if (!user || !(await comparePasswords(currentPassword, user.password))) {
            throw new BadRequest('Current password is incorrect');
        }
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await db.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, validation.userId]
    );

    // Revoke all sessions (security: force re-login everywhere)
    await revokeAllUserSessions(db)(validation.userId, 'password_change');

    await Audit.passwordResetComplete(db, validation.userId, auditCtx);
    if (validation.source === 'update') {
        await Audit.passwordChange(db, validation.userId, auditCtx);
    }
};

/**
 * Cleanup expired tokens (run periodically)
 */
export const cleanupExpiredTokens = async (db: DB): Promise<number> => {
    const result = await db.query<{ count: string }[]>(
        `WITH deleted AS (
            DELETE FROM password_reset_tokens 
            WHERE expires_at < NOW() OR used_at IS NOT NULL
            RETURNING 1
        )
        SELECT COUNT(*) as count FROM deleted`
    );
    return parseInt(result[0]?.count || '0');
};
