/**
 * HTTPS Enforcement Middleware
 * 
 * Redirects HTTP to HTTPS in production environments.
 * Respects X-Forwarded-Proto header when behind a reverse proxy.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that enforces HTTPS in production
 * Checks X-Forwarded-Proto for reverse proxy scenarios
 */
export const httpsEnforcement = (req: Request, res: Response, next: NextFunction): void => {
    // Skip in non-production environments
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    // Check if request is already HTTPS
    // X-Forwarded-Proto is set by load balancers/reverse proxies
    const proto = req.headers['x-forwarded-proto'] || req.protocol;

    if (proto === 'https') {
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
    // Only add HSTS in production over HTTPS
    if (process.env.NODE_ENV === 'production') {
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
