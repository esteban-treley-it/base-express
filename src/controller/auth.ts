import { BadRequest, InternalServerError } from "@/services/errors";
import { SignUpBody, LoginBody } from "@/types/controllers/auth";
import { AppRequest } from "@/types/requests";
import { Response } from "express";
import { comparePasswords, createCookies, generateTokens, hashPassword } from "@/services/auth";
import { InsertUserDB } from "@/types/db/users";

import { tokens as tokenConfig } from "@/config";

import { v4 } from "uuid";
import { getUserByEmail, UserDataWithPassword } from "@/data/users";
import { generateSignedSid, getSidExpirationSQL } from "@/services/session-id";


export const signUp = async (req: AppRequest<SignUpBody>) => {
    const { body, db } = req;

    const userExists = await db!.find("users", { email: body.email });
    if (userExists.length > 0) {
        throw new BadRequest("User already exists", [{ key: "email", message: "Email is already registered" }]);
    }

    body.password = hashPassword(body.password);

    const newUser: InsertUserDB = {
        ...body,
        disabled: false,
        is_owner: true
    };

    const userRes = await db!.insert("users", [newUser]);

    if (userRes.length === 0)
        throw new InternalServerError("Failed to create user. Please try again later.")

    const { password, ...userWithoutPassword } = userRes[0];
    return userWithoutPassword;

}

export const login = async (req: AppRequest<LoginBody>, res: Response) => {
    const { db, body } = req;

    const user = await getUserByEmail(db!)(body.email, true) as UserDataWithPassword;

    if (!user || !comparePasswords(body.password, user.password)) {
        throw new BadRequest("Invalid credentials", { message: "Invalid credentials" });
    }

    const sid = v4()
    const { password, ...userWithoutPassword } = user;
    const tokens = generateTokens(sid, userWithoutPassword);

    const signedSid = generateSignedSid(sid)

    createCookies(res, { ...tokens, sid: signedSid });

    await db!.insert("user_sessions", [{
        sid,
        user_id: user.user_id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: getSidExpirationSQL(),
    }])

    return userWithoutPassword;
}

export const me = async (req: AppRequest<LoginBody>) => {
    return req.user
}