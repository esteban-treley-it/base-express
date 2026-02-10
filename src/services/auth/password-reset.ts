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
import { hashPassword } from './auth';
import { revokeAllUserSessions } from '@/data/user-sessions';
import { BadRequest } from '../errors';
import { InsertPasswordResetTokenDB } from '@/types/db/password_reset_tokens';

// Configuration
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_BYTES = 32; // 256 bits of entropy

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
    email: string
): Promise<{ success: true; token?: string }> => {
    // Find user (but don't reveal if exists)
    const [user] = await db.query<{ user_id: string }[]>(
        'SELECT user_id FROM users WHERE email = $1 AND disabled = false',
        [email.toLowerCase()]
    );

    if (!user) {
        // Return success anyway to prevent email enumeration
        // In production, maybe add a small random delay
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
        expires_at: expiresAt,
    };

    await db.insert('password_reset_tokens', [entry]);

    // TODO: Send email with reset link containing token
    // For now, return token for testing (remove in production!)
    console.log(`[PASSWORD RESET] Token generated for ${email}: ${token}`);

    return { success: true, token }; // Remove token from response in production
};

/**
 * Validates a password reset token
 * Returns user_id if valid
 */
export const validateResetToken = async (
    db: DB,
    token: string
): Promise<{ valid: boolean; userId?: string }> => {
    const hash = hashToken(token);

    const [record] = await db.query<{ user_id: string; expires_at: string; used_at: string | null }[]>(
        `SELECT user_id, expires_at, used_at 
         FROM password_reset_tokens 
         WHERE token_hash = $1`,
        [hash]
    );

    if (!record) {
        return { valid: false };
    }

    // Check if already used
    if (record.used_at) {
        return { valid: false };
    }

    // Check expiration
    if (new Date(record.expires_at) < new Date()) {
        return { valid: false };
    }

    return { valid: true, userId: record.user_id };
};

/**
 * Completes password reset
 * Updates password and revokes all sessions
 */
export const completePasswordReset = async (
    db: DB,
    token: string,
    newPassword: string
): Promise<void> => {
    const hash = hashToken(token);

    // Validate token
    const validation = await validateResetToken(db, token);
    if (!validation.valid || !validation.userId) {
        throw new BadRequest('Invalid or expired reset token');
    }

    // Start transaction
    await db.beginTransaction();

    try {
        // Mark token as used
        await db.query(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1',
            [hash]
        );

        // Update password
        const hashedPassword = hashPassword(newPassword);
        await db.query(
            'UPDATE users SET password = $1, updated_at = NOW() WHERE user_id = $2',
            [hashedPassword, validation.userId]
        );

        // Revoke all sessions (security: force re-login everywhere)
        await revokeAllUserSessions(db)(validation.userId, 'password_change');

        await db.commit();
    } catch (error) {
        await db.rollback();
        throw error;
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
