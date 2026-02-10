import { NextFunction, Response } from "express"
import z from "zod";

import DB from "./db";
import { BadRequest, errorHandler } from "./errors";
import { authMiddleware, AuthenticatedRequest } from "./auth";
import { app as appConfig } from "@/config";

import type { AppRequest } from "@/types/requests"

const debugLog = (label: string, req: AppRequest) => {
    if (!appConfig.debug) return;
    console.log(`[debug:${label}] ${req.method} ${req.originalUrl}`);
};

/**
 * Global lightweight request trace middleware.
 * Logs method and path before any other middleware/handler runs.
 * Avoids logging bodies/headers to keep sensitive data out of logs.
 */
const requestTraceMiddleware = async (req: AppRequest, _res: Response, next: NextFunction) => {
    debugLog('trace', req);
    next();
};

/**
 * Request handler wrapper with automatic DB lifecycle management
 * 
 * Flow:
 * 1. Creates DB instance and connects (acquires connection + starts transaction)
 * 2. Executes the handler
 * 3. On success: commits transaction
 * 4. On error: rolls back transaction
 * 5. Always: releases connection back to pool
 */
export const handleRequest = (fn: Function) => async (req: AppRequest, res: Response, next: NextFunction) => {
    // Create DB instance for this request
    const db = new DB();
    req.db = db;

    try {
        debugLog('handler', req);

        // Acquire connection and start transaction
        await db.connect();

        // Execute the handler
        const result = await fn(req, res);

        // Success: commit transaction
        await db.commit();

        // Send response
        if (result) {
            res.status(200).json({ success: true, data: result });
        } else {
            res.status(204).json({ success: true });
        }
    } catch (error) {
        // Error: rollback transaction
        await db.rollback();
        errorHandler(req, res, next)(error);
    } finally {
        // Always: release connection back to pool
        db.release();
    }
}

const schemaMiddleware = (schema: z.AnyZodObject) => async (req: AppRequest, res: Response, next: NextFunction) => {
    debugLog('schema', req);
    try {
        const { body } = req
        const validation = schema.safeParse(body)
        if (!validation.success)
            return errorHandler(req, res, next)(new BadRequest("Invalid request body", validation.error.errors.map(e => ({ key: e.path.join("."), message: e.message }))));

        next();
    } catch (error) {
        next(error);
    }
}

const authLoggingMiddleware = async (req: AppRequest, res: Response, next: NextFunction) => {
    debugLog('auth', req);
    // Wrap the core auth middleware to keep legacy fields (req.user, req.sessionId) in sync
    return authMiddleware()(req as any, res, (err?: unknown) => {
        if (err) return next(err);

        const authReq = req as unknown as AuthenticatedRequest;
        const authCtx = authReq.auth;

        if (authCtx) {
            // Legacy compatibility: populate req.user and req.sessionId
            req.user = {
                user_id: authCtx.userId,
                email: authCtx.email,
                name: (req.user as any)?.name, // preserve if already set
                org: {
                    id: authCtx.orgId,
                    role: authCtx.role,
                }
            } as any;
            req.sessionId = authCtx.sid;
        }

        next();
    });
};

export const middlewares = {
    schema: schemaMiddleware,
    auth: authLoggingMiddleware,
    requestTrace: requestTraceMiddleware,
}
