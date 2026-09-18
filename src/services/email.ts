/**
 * Transactional Email Service
 *
 * Uses Resend (already a dependency) to send verification and password-reset
 * emails. Falls back to logging the link instead of sending when RESEND_API_KEY
 * is unset, so auth flows keep working with zero email configuration.
 */

import { Resend } from 'resend';
import { app as appConfig, email as emailConfig } from '@/config';
import { logger } from './logger';
import type { PasswordResetSource } from '@/types/db/password_reset_tokens';

let client: Resend | null = null;

const getClient = (): Resend => {
    if (!client) client = new Resend(emailConfig.resendApiKey);
    return client;
};

export const isEmailConfigured = (): boolean => !!emailConfig.resendApiKey;

interface SendEmailArgs {
    to: string;
    subject: string;
    html: string;
}

const wrapEmailHtml = (title: string, bodyHtml: string): string => `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 16px;">${title}</h2>
    ${bodyHtml}
</div>
`.trim();

export const sendEmail = async ({ to, subject, html }: SendEmailArgs): Promise<void> => {
    if (!isEmailConfigured()) {
        logger.info('email', `RESEND_API_KEY not set, skipping send. Would have sent "${subject}" to ${to}`);
        if (appConfig.isDev) {
            logger.debug('email', html);
        }
        return;
    }

    try {
        await getClient().emails.send({
            from: emailConfig.fromAddress,
            to,
            subject,
            html,
        });
    } catch (error) {
        logger.error('email', 'Failed to send:', subject, error);
    }
};

export const sendVerificationEmail = async (to: string, token: string): Promise<void> => {
    const link = `${emailConfig.appUrl}/verify-email?token=${token}`;
    await sendEmail({
        to,
        subject: 'Verify your email',
        html: wrapEmailHtml('Verify your email', `
            <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
            <p><a href="${link}">${link}</a></p>
        `),
    });
};

export const sendPasswordResetEmail = async (
    to: string,
    token: string,
    source: PasswordResetSource
): Promise<void> => {
    const link = `${emailConfig.appUrl}/reset-password?token=${token}`;
    const title = source === 'update' ? 'Confirm your password change' : 'Reset your password';
    const intro = source === 'update'
        ? 'A password change was requested for your account. Click the link below to confirm. This link expires in 1 hour.'
        : 'A password reset was requested for your account. Click the link below to continue. This link expires in 1 hour.';

    await sendEmail({
        to,
        subject: title,
        html: wrapEmailHtml(title, `
            <p>${intro}</p>
            <p><a href="${link}">${link}</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
        `),
    });
};

export default {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    isEmailConfigured,
};
