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


const addToErrorTables = (req: AppRequest, error: BaseError) => {
    const { headers, body, user, db } = req

    if (body.password) delete body.password

    const errorPayload = {
        message: error.message,
        method: req.method.toUpperCase(),
        route: req.originalUrl,
        headers: JSON.stringify(headers),
        body: JSON.stringify(body),
        user_data: JSON.stringify(user)
    }

    db!.insert('error_logs', [errorPayload]).then((val) => {
        console.log('Error created')
    }).catch(() => {
        console.error('Error adding errors to logs')
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

    return res.status(500).json({
        error: "Internal server error",
        timestamp: new Date().toISOString(),
    });
};