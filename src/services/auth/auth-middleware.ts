/**
 * Auth Middleware
 * 
 * Express middleware for JWT authentication.
 * Supports both cookie-based and Bearer token auth.
 */

import { Request, Response, NextFunction } from 'express';
import { getActiveSession } from '@/data/user-sessions';
import { tokens as tokenConfig, auth as authConfig } from '@/config';
import { Unauthorized } from '../errors';
import { AuthCache } from './auth-cache';
import { verifyAccessToken } from './jwt';
import { AccessTokenPayload } from '@/types/auth';
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
    loadSession?: boolean;  // Whether to load full session from DB
    requireOrg?: boolean;   // Require organization membership
}

/**
 * Gets the access token from request
 * Prefers Authorization header, falls back to cookie
 */
const getAccessToken = (req: Request): string | null => {
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // Fall back to cookie
    return req.cookies?.[tokenConfig.names.access] || null;
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

            // Check blacklist first (fast rejection for revoked tokens)
            const cache = AuthCache.getInstance();
            const isBlacklisted = await cache.isBlacklisted(token);
            if (isBlacklisted) {
                throw new Unauthorized('Token has been revoked', 'TOKEN_REVOKED');
            }

            // Verify and decode the token
            let payload: AccessTokenPayload;
            try {
                payload = verifyAccessToken(token);
            } catch {
                throw new Unauthorized('Invalid or expired token');
            }

            // Build auth context
            const authContext: AuthenticatedRequest['auth'] = {
                userId: payload.sub,
                email: payload.email,
                sid: payload.sid,
                orgId: payload.org_id,
                role: payload.role,
            };

            // Optionally load full session from DB
            if (options.loadSession) {
                const db = req.app.locals.db;
                const session = await getActiveSession(db)(payload.sid);

                if (!session || session.status === 'revoked') {
                    throw new Unauthorized('Session not found or revoked');
                }

                authContext.session = session;
            }

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
 * Attaches auth context if token is present, but doesn't require it
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
                const cache = AuthCache.getInstance();
                const isBlacklisted = await cache.isBlacklisted(token);

                if (!isBlacklisted) {
                    try {
                        const payload = verifyAccessToken(token);
                        (req as AuthenticatedRequest).auth = {
                            userId: payload.sub,
                            email: payload.email,
                            sid: payload.sid,
                            orgId: payload.org_id,
                            role: payload.role,
                        };
                    } catch {
                        // Token invalid, continue without auth
                    }
                }
            }

            next();
        } catch {
            next();
        }
    };
};

export default authMiddleware;
