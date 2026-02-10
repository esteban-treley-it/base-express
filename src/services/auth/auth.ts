/**
 * Auth Utilities
 * 
 * Core authentication functions for password handling.
 */

import bcrypt from 'bcrypt';
import { security, tokens } from '@/config';
import { Unauthorized } from '../errors';

/**
 * Hashes a password using bcrypt with configured salt rounds
 */
export const hashPassword = (password: string): string => {
    const salt = bcrypt.genSaltSync(security.saltRounds);
    return bcrypt.hashSync(password, salt);
};

/**
 * Compares a plain password against a hashed password
 */
export const comparePasswords = (password: string, storedHash: string): boolean => {
    return bcrypt.compareSync(password, storedHash);
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
