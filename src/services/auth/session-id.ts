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
 * Clears every auth cookie (for logout).
 * Names and paths must match the ones used when the cookies were set (controller/auth.ts),
 * otherwise the browser keeps them.
 */
export const clearSidFromCookies = (res: {
    clearCookie: (name: string, options?: Record<string, unknown>) => void;
}): void => {
    res.clearCookie(tokenConfig.names.access, { path: '/' });
    res.clearCookie(tokenConfig.names.id, { path: '/' });
    res.clearCookie(tokenConfig.names.refresh, { path: tokenConfig.refreshCookiePath });
    // Cookies issued before the path change were scoped to /refresh only
    res.clearCookie(tokenConfig.names.refresh, { path: `${tokenConfig.refreshCookiePath}/refresh` });
};
