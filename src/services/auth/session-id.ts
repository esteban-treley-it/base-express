/**
 * Session ID Utilities
 * 
 * Functions for managing session IDs in cookies and database.
 */

import { tokens as tokenConfig } from '@/config';

/**
 * Generates SQL for calculating session expiration
 * Used when inserting new sessions
 */
export const getSidExpirationSQL = (): string => {
    const refreshExpiryMs = tokenConfig.expiry.refresh;
    return new Date(Date.now() + refreshExpiryMs).toISOString();
};

/**
 * Clears the SID from cookies (for logout)
 */
export const clearSidFromCookies = (res: {
    clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void => {
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('access', { path: '/' });
    res.clearCookie('refresh', { path: '/' });
    res.clearCookie('id', { path: '/' });
};
