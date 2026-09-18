/**
 * Auth Middleware
 *
 * Express middleware for JWT authentication.
 * Supports both cookie-based and Bearer token auth.
 *
 * Security: a valid signature is not enough. Every authenticated request also checks that the
 * session is still active (not revoked/expired) and the user is not disabled, so logout,
 * refresh-token-reuse revocation, password changes and account disabling take effect
 * immediately instead of after the access token expires. It's one indexed primary-key lookup.
 */

import { Request, Response, NextFunction } from 'express';
import DB from '@/services/db';
import { tokens as tokenConfig } from '@/config';
import { Unauthorized } from '../errors';
import { verifyAccessToken } from './jwt';
import { UserSessionDB } from '@/types/db/user_sessions';

/**
 * Extended Request type with auth context
 */
export interface AuthenticatedRequest extends Request {
    auth: {
        userId: string;
        email: string;
        sid: string;
        orgId?: string;
        role?: string;
        session?: UserSessionDB;
    };
}

/**
 * Options for auth middleware
 */
export interface AuthMiddlewareOptions {
    requireOrg?: boolean;   // Require organization membership
}

/**
 * Gets the access token from request
 * Prefers Authorization header, falls back to cookie
 */
export const getAccessToken = (req: Request): string | null => {
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // Fall back to cookie
    return req.cookies?.[tokenConfig.names.access] || null;
};

/**
 * Verifies the access token AND that its session is still live. Throws Unauthorized otherwise.
 */
const resolveAuthContext = async (token: string): Promise<AuthenticatedRequest['auth']> => {
    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch {
        throw new Unauthorized('Invalid or expired token');
    }

    const [live] = await DB.queryOnce<{ sid: string }[]>(
        `SELECT s.sid
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.sid = $1 AND s.user_id = $2
           AND s.status = 'active' AND s.expires_at > NOW()
           AND u.disabled = false`,
        [payload.sid, payload.sub]
    );
    if (!live) {
        throw new Unauthorized('Session not found or revoked', 'SESSION_REVOKED');
    }

    return {
        userId: payload.sub,
        email: payload.email,
        sid: payload.sid,
        orgId: payload.org_id,
        role: payload.role,
    };
};

/**
 * Auth middleware
 * Validates access token and attaches auth context to request
 */
export const authMiddleware = (options: AuthMiddlewareOptions = {}) => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const token = getAccessToken(req);

            if (!token) {
                throw new Unauthorized('No access token provided');
            }

            const authContext = await resolveAuthContext(token);

            // Check org requirement
            if (options.requireOrg && !authContext.orgId) {
                throw new Unauthorized('Organization membership required');
            }

            // Attach auth context to request
            (req as AuthenticatedRequest).auth = authContext;

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Optional auth middleware
 * Attaches auth context if token is present and valid, but doesn't require it
 */
export const optionalAuthMiddleware = () => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const token = getAccessToken(req);
            if (token) {
                try {
                    (req as AuthenticatedRequest).auth = await resolveAuthContext(token);
                } catch {
                    // Invalid/revoked token, continue without auth
                }
            }
            next();
        } catch {
            next();
        }
    };
};

export default authMiddleware;
