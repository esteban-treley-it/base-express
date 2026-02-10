import { AppRequest } from "@/types/requests";
import { NextFunction, Response } from "express";

class BaseError extends Error {
    public status: number;
    public data?: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.status = status;
        this.data = data;

        Object.setPrototypeOf(this, new.target.prototype);
        this.name = this.constructor.name;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export class NotFound extends BaseError {
    constructor(message = "Resource not found", data?: unknown) {
        super(404, message, data);
    }
}
export class BadRequest extends BaseError {
    constructor(message = "Bad request", data?: unknown) {
        super(400, message, data);
    }
}
export class Unauthorized extends BaseError {
    constructor(message = "Unauthorized", data?: unknown) {
        super(401, message, data);
    }
}
export class Forbidden extends BaseError {
    constructor(message = "Forbidden", data?: unknown) {
        super(403, message, data);
    }
}
export class InternalServerError extends BaseError {
    constructor(message = "Internal server error", data?: unknown) {
        super(500, message, data);
    }
}

export class ServiceUnavailable extends BaseError {
    constructor(message = "Service Unavailable", data?: unknown) {
        super(523, message, data);
    }
}


// Security: Sanitize sensitive data before logging
const sanitizeForLogging = (data: Record<string, unknown>): Record<string, unknown> => {
    const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'x-access-token', 'x-refresh-token', 'x-id-token', 'x-sid'];
    const sanitized = { ...data };

    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
            sanitized[key] = '[REDACTED]';
        }
    }

    return sanitized;
};

const addToErrorTables = (req: AppRequest, error: BaseError) => {
    const { body, user, db } = req

    // Skip DB logging if no database connection
    if (!db) {
        console.warn('[ErrorLog] No database connection, skipping DB log');
        return;
    }

    // Security: Only log safe headers, not Authorization/Cookies
    const safeHeaders = {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-request-id': req.headers['x-request-id']
    };

    // Security: Sanitize body before logging
    const sanitizedBody = sanitizeForLogging(body || {});

    const errorPayload = {
        message: error.message,
        method: req.method.toUpperCase(),
        route: req.originalUrl,
        headers: JSON.stringify(safeHeaders),
        body: JSON.stringify(sanitizedBody),
        user_data: JSON.stringify(user ? { id: user.user_id } : null) // Only log user ID, not full data
    }

    db.insert('error_logs', [errorPayload]).then(() => {
        // Silent success - don't clutter logs
    }).catch((dbError: unknown) => {
        // Log to console as fallback, with actual error details
        const errMsg = dbError instanceof Error ? dbError.message : 'Unknown error';
        
        // Check for missing table specifically
        if (errMsg.includes('relation') && errMsg.includes('does not exist')) {
            console.warn('[ErrorLog] Table "error_logs" does not exist. Run migrations to create it.');
        } else {
            console.error('[ErrorLog] Failed to write to DB:', errMsg);
        }
        
        // Fallback: Log error details to console
        console.error('[ErrorLog] Error details:', {
            method: errorPayload.method,
            route: errorPayload.route,
            message: errorPayload.message,
            userId: user?.user_id || 'anonymous'
        });
    })
}

export const errorHandler = (
    req: AppRequest,
    res: Response,
    _next: NextFunction
) => (err: unknown) => {
    if (err instanceof BaseError) {
        const { status, message, data } = err;
        addToErrorTables(req, err)
        return res.status(status).json({
            error: message,
            data,
            timestamp: new Date().toISOString(),
        });
    }

    // Log unexpected errors with details
    const errMessage = err instanceof Error ? err.message : 'Unknown error';
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error('[UnhandledError]', {
        message: errMessage,
        stack: errStack,
        route: req.originalUrl,
        method: req.method
    });

    // Try to log to DB as InternalServerError
    const internalError = new InternalServerError(errMessage);
    addToErrorTables(req, internalError);

    return res.status(500).json({
        error: "Internal server error",
        timestamp: new Date().toISOString(),
    });
};