import jwt from "jsonwebtoken";
import fs from "fs";
import bcrypt from "bcrypt";

import { app, tokens } from "@/config";
import { InternalServerError } from "@/services/errors";

import type { Request, Response } from "express";
import { UserTokenData } from "@/types/data/users";
import { RefreshTokenData } from "@/types/auth";
import { TokenStatus, ValidateTokens } from "@/types/services/request";
const projectRoot = process.cwd();

const getPrivateKeyFile = () => {
    if (app.jwtPrivateKeyPath) {
        try {
            const file = fs.readFileSync(projectRoot + app.jwtPrivateKeyPath, "utf8");
            if (file) {
                return file;
            }
        } catch (err) {
            throw new InternalServerError("Private key file is empty or not found.");
        }

    }
    throw new InternalServerError("Private key file is not configured in the app settings.");
}

export const comparePasswords = (password: string, hashedPassword: string): boolean => {
    return bcrypt.compareSync(password, hashedPassword);
}

export const hashPassword = (password: string): string => {
    const salt = bcrypt.genSaltSync(app.saltRounds);
    return bcrypt.hashSync(password, salt);
}

export const generateToken = (type: 'access' | 'refresh' | 'id', payload: any) => {
    try {
        const privateKey = getPrivateKeyFile();
        const options = { expiresIn: tokens.expiry[type], algorithm: 'RS256' as jwt.Algorithm };
        return jwt.sign(payload, privateKey, options);
    } catch (error) {
        throw new InternalServerError("Failed to generate token");
    }
}

export const generateTokens = (sid: string, user: UserTokenData) => {
    const accessTokenData = { sid, user: { id: user.user_id, email: user.email, is_owner: user.is_owner } };
    const refreshTokenData = { sid, user: { id: user.user_id, email: user.email, org_id: user.org.id } };
    const idTokenData = { sid, user: { id: user.user_id, email: user.email, is_owner: user.is_owner, org: { id: user.org.id, role: user.org.role } } };
    const accessToken = generateToken('access', accessTokenData);
    const refreshToken = generateToken('refresh', refreshTokenData);
    const idToken = generateToken('id', idTokenData);

    return {
        accessToken,
        refreshToken,
        idToken,
    }
}

export const createCookies = (res: Response, { accessToken, refreshToken, idToken, sid }: { accessToken: string, refreshToken: string, idToken: string, sid: string }) => {
    res.cookie(tokens.names.access, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.access,
    });

    res.cookie(tokens.names.refresh, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.refresh,
    });

    res.cookie(tokens.names.id, idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.id,
    });

    res.cookie(tokens.names.access, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.access,
    });

    res.cookie(tokens.names.refresh, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.refresh,
    });

    res.cookie(tokens.names.sid, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: tokens.expiry.refresh,
    });
}

export const decryptToken = (token: string) => {
    try {
        const privateKey = getPrivateKeyFile();
        return jwt.verify(token, privateKey, { algorithms: ['RS256'] });
    } catch (error) {
        console.log(error)
        return null
    }
}

const getCookies = (req: Request): Record<string, string> => {
    const cookies = req.headers.cookie || '';
    return (cookies.split(';')).reduce((acc: any, cookie: string) => {
        const [name, value] = cookie.trim().split('=');
        acc[name] = value;
        return acc;
    }, {});
}

export const getAuthCookies = (req: Request) => {
    const cookies = getCookies(req)

    return {
        accessToken: cookies[tokens.names.access],
        refreshToken: cookies[tokens.names.refresh],
        idToken: cookies[tokens.names.id],
        sid: cookies[tokens.names.sid]
    };
}

export const validateTokenStatus = ({ accessToken, idToken }: ValidateTokens): TokenStatus => {
    if (!accessToken || !idToken) return { status: "expired" };
    try {
        const idTokenData = decryptToken(idToken);
        const accessTokenData = decryptToken(accessToken);
        return { status: "valid", tokens: { idToken: idTokenData, accessToken: accessTokenData } };
    } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("expired")) return { status: "expired" };
        return { status: "invalid" };
    }
};