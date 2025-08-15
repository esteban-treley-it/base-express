import { ValidateTokens } from "@/types/services/request";
import { createCookies, decryptToken, generateTokens, validateTokenStatus } from "./auth";
import RedisSingleton from "./redis";
import { Unauthorized } from "./errors";
import DB from "./db";
import { getActiveSession } from "@/data/user-sessions";
import { RefreshTokenData } from "@/types/auth";
import { getUserByEmail } from "@/data/users";
import { Response } from "express";
import { getSidExpirationSQL } from "./session-id";
import { UserTokenData } from "@/types/data/users";

const inProgressValidation = new Map()
const UNAUTHORIZED_MSG = "User is not authenticated.";
const TTL_SECONDS = 10 * 60;

export class AuthCache {
    private key: string
    private db: DB
    private tokens: ValidateTokens
    private refreshTokenData?: RefreshTokenData
    constructor(key: string, db: DB, tokens: ValidateTokens) {
        this.key = key
        this.db = db
        this.tokens = tokens
    }

    async verifyRefreshToken(): Promise<RefreshTokenData> {
        if (!this.tokens.refreshToken) throw new Unauthorized(UNAUTHORIZED_MSG, "Missing x-refresh-token header");

        const refreshTokenData = decryptToken(this.tokens.refreshToken) as RefreshTokenData;
        const activeSession = await getActiveSession(this.db)(refreshTokenData.sid);
        if (!activeSession) throw new Unauthorized(UNAUTHORIZED_MSG, "No active session");

        return refreshTokenData
    }

    async validateTokens(res: Response) {
        try {
            if (!this.refreshTokenData) throw new Unauthorized(UNAUTHORIZED_MSG)

            const user = await getUserByEmail(this.db)(this.refreshTokenData.user.email, false);
            if (!user) throw new Unauthorized(UNAUTHORIZED_MSG)

            const tokenStatus = validateTokenStatus(this.tokens)
            if (tokenStatus.status === "invalid") throw new Unauthorized(UNAUTHORIZED_MSG);
            if (tokenStatus.status === 'valid') return user

            const newTokens = generateTokens(this.refreshTokenData.sid, user);
            createCookies(res, { ...newTokens, sid: this.key });
            return user
        } finally {
            inProgressValidation.delete(this.key);
        }

    }


    async updateUserSession() {
        this.db.update('user_sessions', { expires_at: getSidExpirationSQL() }, { sid: this.refreshTokenData!.sid })
    }

    async execute(res: Response) {
        this.refreshTokenData = await this.verifyRefreshToken();

        const redis = RedisSingleton.getInstance();
        const redisAvailable = await RedisSingleton.ping();

        if (redisAvailable) {
            const cachedVerification = await redis.get('verify:' + this.key);
            if (cachedVerification) {
                await this.updateUserSession()
                return JSON.parse(cachedVerification) as UserTokenData;
            }
        }

        let promise = inProgressValidation.get(this.key);
        if (!promise) {
            promise = this.validateTokens(res).finally(() => inProgressValidation.delete(this.key));
            inProgressValidation.set(this.key, promise);
        }

        const cachedUser = await promise;
        await Promise.all([
            redisAvailable ? redis.set('verify:' + this.key, JSON.stringify(cachedUser), 'EX', TTL_SECONDS) : null,
            this.updateUserSession()
        ]);

        return cachedUser;
    }
}