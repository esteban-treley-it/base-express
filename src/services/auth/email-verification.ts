/**
 * Email Verification Service (Optional: MODULE_EMAIL_VERIFICATION=true)
 *
 * Same token pattern as password-reset: random token emailed to the user,
 * SHA-256 hash stored in DB, checked on completion.
 */

import crypto from 'crypto';
import DB from '../db';
import { BadRequest } from '../errors';
import { sendVerificationEmail } from '../email';

const TOKEN_BYTES = 32;
const RESEND_COOLDOWN_SECONDS = 60; // min time between verification emails per user

const generateToken = (): { token: string; hash: string } => {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
};

/**
 * Generates a verification token for a user and emails it.
 * Returns false (and sends nothing) when one was sent less than a minute ago, so the resend
 * endpoints can't be used to flood an inbox or burn the email quota.
 */
export const initiateEmailVerification = async (
    db: DB,
    userId: string,
    email: string
): Promise<boolean> => {
    const { token, hash } = generateToken();

    // Single atomic statement: only issues a new token if the previous one is old enough
    const updated = await db.query<{ id: string }[]>(
        `UPDATE users
         SET email_verification_token = $1,
             email_verification_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $2
           AND (email_verification_sent_at IS NULL
                OR email_verification_sent_at < NOW() - make_interval(secs => $3))
         RETURNING id`,
        [hash, userId, RESEND_COOLDOWN_SECONDS]
    );
    if (updated.length === 0) return false;

    // Not awaited: waiting on the mail provider only for existing accounts would make response
    // time reveal which emails are registered. sendEmail never throws.
    void sendVerificationEmail(email, token).catch(() => undefined);
    return true;
};

/**
 * Validates a verification token and marks the user's email as verified.
 */
export const completeEmailVerification = async (
    db: DB,
    token: string
): Promise<void> => {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const [user] = await db.query<{ id: string; email_verified_at: string | null; fresh: boolean | null }[]>(
        `SELECT id, email_verified_at,
                (email_verification_sent_at > NOW() - INTERVAL '24 hours') AS fresh
         FROM users
         WHERE email_verification_token = $1 AND disabled = false`,
        [hash]
    );

    if (!user) throw new BadRequest('Invalid or expired verification token', 'INVALID_VERIFICATION_TOKEN');
    if (user.email_verified_at) throw new BadRequest('Email already verified', 'ALREADY_VERIFIED');

    // Expiry is evaluated in SQL: parsing a tz-less timestamp in JS depends on the server's timezone
    if (!user.fresh) {
        throw new BadRequest('Verification token has expired', 'VERIFICATION_TOKEN_EXPIRED');
    }

    await db.query(
        `UPDATE users
         SET email_verified_at = NOW(),
             email_verification_token = NULL,
             email_verification_sent_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id]
    );
};
