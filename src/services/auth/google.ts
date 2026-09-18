/**
 * Google Sign-In Service (Optional: MODULE_GOOGLE_AUTH=true + GOOGLE_CLIENT_ID)
 *
 * Verifies a Google ID token against Google's JWKS: signature, issuer, expiry,
 * and `aud` = GOOGLE_CLIENT_ID (this audience check is what stops a token minted
 * for another app from being replayed against this API).
 */

import { OAuth2Client } from 'google-auth-library';
import { google as googleConfig } from '@/config';
import { InternalServerError, Unauthorized } from '../errors';

let client: OAuth2Client | null = null;

const getClient = (): OAuth2Client => {
    if (!googleConfig.clientId) throw new InternalServerError('Google Sign-In is not configured');
    if (!client) client = new OAuth2Client(googleConfig.clientId);
    return client;
};

export const isGoogleSignInEnabled = (): boolean => !!googleConfig.clientId;

export interface GoogleIdentity {
    sub: string;
    email: string;
    name?: string;
}

export const verifyGoogleIdToken = async (credential: string): Promise<GoogleIdentity> => {
    let payload;
    try {
        const ticket = await getClient().verifyIdToken({
            idToken: credential,
            audience: googleConfig.clientId,
        });
        payload = ticket.getPayload();
    } catch {
        // Malformed/expired/wrong-audience token from google-auth-library - client error, not a server fault
        throw new Unauthorized('Invalid Google token', 'INVALID_GOOGLE_TOKEN');
    }

    if (!payload || !payload.sub || !payload.email) {
        throw new Unauthorized('Invalid Google token', 'INVALID_GOOGLE_TOKEN');
    }
    if (!payload.email_verified) {
        throw new Unauthorized('Google email not verified', 'GOOGLE_EMAIL_NOT_VERIFIED');
    }

    return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name,
    };
};

export default {
    verifyGoogleIdToken,
    isGoogleSignInEnabled,
};
