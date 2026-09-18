/**
 * Auth Utilities
 * 
 * Core authentication functions for password handling.
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { security, tokens } from '@/config';
import { Unauthorized } from '../errors';

/**
 * Hashes a password using bcrypt with configured salt rounds.
 * Async on purpose: the sync variants block the event loop for the whole process.
 */
export const hashPassword = (password: string): Promise<string> => {
    return bcrypt.hash(password, security.saltRounds);
};

// Hash of a random secret, compared against when there is nothing real to compare with
// (unknown email, or an account without a password such as Google-only). Keeps response time
// the same in every case so login can't be used to tell which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => {
    if (!dummyHash) dummyHash = bcrypt.hash(crypto.randomBytes(32).toString('hex'), security.saltRounds);
    return dummyHash;
};
void getDummyHash(); // warm it up so the first "no such user" login isn't measurably slower

/**
 * Compares a plain password against a stored hash.
 * A missing hash (no such user / no password set) always fails, after doing the same work.
 */
export const comparePasswords = async (password: string, storedHash: string | null | undefined): Promise<boolean> => {
    if (!storedHash) {
        await bcrypt.compare(password, await getDummyHash());
        return false;
    }
    return bcrypt.compare(password, storedHash);
};

/**
 * Decrypts a token from a header value
 * Supports both "Bearer <token>" and raw token formats
 */
export const decryptToken = (authorization: string | undefined): string | null => {
    if (!authorization) return null;

    if (authorization.startsWith('Bearer ')) {
        return authorization.slice(7);
    }

    return authorization;
};

/**
 * Gets auth cookies from request
 */
export const getAuthCookies = (requestCookies: Record<string, string>): {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
} => {
    return {
        accessToken: requestCookies[tokens.names.access],
        refreshToken: requestCookies[tokens.names.refresh],
        idToken: requestCookies[tokens.names.id],
    };
};

/**
 * Validates that token status is active
 */
export const validateTokenStatus = (
    status: 'active' | 'revoked' | 'expired' | 'invalid' | 'not_found'
): void => {
    if (status !== 'active') {
        throw new Unauthorized(`Token ${status}`, status.toUpperCase());
    }
};
