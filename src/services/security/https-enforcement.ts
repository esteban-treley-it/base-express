/**
 * HTTPS Enforcement Middleware
 * 
 * Redirects HTTP to HTTPS in production environments.
 * Respects X-Forwarded-Proto header when behind a reverse proxy.
 */

import { Request, Response, NextFunction } from 'express';
import { app as appConfig } from '@/config';

/**
 * Middleware that enforces HTTPS in production
 * Checks X-Forwarded-Proto for reverse proxy scenarios
 */
export const httpsEnforcement = (req: Request, res: Response, next: NextFunction): void => {
    // Skip only in development/local/test (fail closed: an unset or mistyped NODE_ENV enforces HTTPS)
    if (appConfig.isDev) {
        return next();
    }

    // req.protocol reads X-Forwarded-Proto only when 'trust proxy' is configured (server.ts),
    // so a client can't claim HTTPS by sending the header itself.
    if (req.protocol === 'https') {
        return next();
    }

    // Redirect to HTTPS
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    res.redirect(301, httpsUrl);
};

/**
 * Middleware that adds HSTS header
 * Should only be applied after HTTPS is confirmed
 */
export const hstsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Add HSTS everywhere except development/local/test
    if (!appConfig.isDev) {
        // max-age: 1 year (31536000 seconds)
        // includeSubDomains: Apply to all subdomains
        // preload: Allow inclusion in browser preload lists
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }
    next();
};
