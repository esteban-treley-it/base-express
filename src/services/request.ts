import { NextFunction, Response } from "express"
import z from "zod";

import DB from "./db";
import { BadRequest, errorHandler, Unauthorized } from "./errors";
import { createCookies, decryptToken, generateTokens, getAuthCookies, validateTokenStatus } from "./auth";


import { getActiveSession } from "@/data/user-sessions";
import { getUserByEmail } from "@/data/users";

import type { AppRequest } from "@/types/requests"
import type { RefreshTokenData } from "@/types/auth";
import { AuthCache } from "./auth-cache";
import { verifySignedSid } from "./session-id";

export const handleRequest = (fn: Function) => async (req: AppRequest, res: Response, next: NextFunction) => {
    try {
        const result = await fn(req, res);
        if (result) {
            res.status(200).json({ success: true, data: result });
        } else {
            res.status(204).json({ success: true });
        }
    } catch (error) {
        errorHandler(req, res, next)(error);
    }
}

const schemaMiddleware = (schema: z.AnyZodObject) => async (req: AppRequest, res: Response, next: NextFunction) => {
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

const dbMiddleware = async (req: AppRequest, res: Response, next: NextFunction) => {
    try {
        req.db = new DB()
        next();
    } catch (error) {
        next(error);
    }
}

const authMiddleware = async (req: AppRequest, res: Response, next: NextFunction) => {
    const { db } = req;

    try {
        const tokens = getAuthCookies(req);
        if (!tokens.sid || !verifySignedSid(tokens.sid)) throw new Unauthorized("User not authenticated.", "Header x-sid missing")
        const user = await (new AuthCache(tokens.sid, db!, tokens)).execute(res)
        req.user = user;
        next();
    } catch (error) {
        errorHandler(req, res, next)(error);
    }
};

export const middlewares = {
    db: dbMiddleware,
    schema: schemaMiddleware,
    auth: authMiddleware
}