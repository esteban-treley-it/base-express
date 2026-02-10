/**
 * Auth Cache Service
 * 
 * Redis-based caching for authentication tokens and sessions.
 * Provides fast validation without database lookups.
 */

import RedisSingleton from '../redis';
import { UserTokenData } from '@/types/data/users';
import { tokens as tokenConfig } from '@/config';

/**
 * Cache key prefixes
 */
export const CACHE_KEYS = {
    SESSION: 'session:',        // Session data by SID
    ACCESS: 'access:',          // Access token validation
    REFRESH: 'refresh:',        // Refresh token (JTI) status
    USER: 'user:',              // User profile data
    BLACKLIST: 'blacklist:',    // Revoked tokens
} as const;

/**
 * Cached session data structure
 */
export interface CachedSession {
    userId: string;
    userData: UserTokenData;
    jti: string;
    createdAt: string;
    expiresAt: string;
}

/**
 * Auth cache operations
 */
export class AuthCache {
    private static instance: AuthCache;
    private redis = RedisSingleton.getInstance();

    private constructor() {}

    static getInstance(): AuthCache {
        if (!AuthCache.instance) {
            AuthCache.instance = new AuthCache();
        }
        return AuthCache.instance;
    }

    /**
     * Checks if Redis is available for caching
     */
    async isAvailable(): Promise<boolean> {
        return RedisSingleton.ping();
    }

    /**
     * Caches session data for fast validation
     * TTL matches refresh token expiry
     */
    async cacheSession(sid: string, session: CachedSession): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.SESSION}${sid}`;
        const ttl = Math.floor(tokenConfig.expiry.refresh / 1000);

        await this.redis.set(key, JSON.stringify(session), 'EX', ttl);
    }

    /**
     * Gets cached session data
     */
    async getSession(sid: string): Promise<CachedSession | null> {
        const available = await this.isAvailable();
        if (!available) return null;

        const key = `${CACHE_KEYS.SESSION}${sid}`;
        const data = await this.redis.get(key);

        if (!data) return null;

        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    /**
     * Invalidates a session in cache
     */
    async invalidateSession(sid: string): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.SESSION}${sid}`;
        await this.redis.del(key);
    }

    /**
     * Caches JTI as valid (for refresh token validation)
     */
    async cacheJti(jti: string, sid: string): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.REFRESH}${jti}`;
        const ttl = Math.floor(tokenConfig.expiry.refresh / 1000);

        await this.redis.set(key, sid, 'EX', ttl);
    }

    /**
     * Checks if JTI is valid in cache
     * Returns the SID if valid, null if not found or invalid
     */
    async checkJti(jti: string): Promise<string | null> {
        const available = await this.isAvailable();
        if (!available) return null;

        const key = `${CACHE_KEYS.REFRESH}${jti}`;
        return this.redis.get(key);
    }

    /**
     * Invalidates a JTI (marks refresh token as used/revoked)
     */
    async invalidateJti(jti: string): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.REFRESH}${jti}`;
        await this.redis.del(key);
    }

    /**
     * Blacklists an access token (for logout/revocation)
     * TTL matches access token expiry
     */
    async blacklistAccessToken(token: string): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.BLACKLIST}${token}`;
        const ttl = Math.floor(tokenConfig.expiry.access / 1000);

        await this.redis.set(key, '1', 'EX', ttl);
    }

    /**
     * Checks if an access token is blacklisted
     */
    async isBlacklisted(token: string): Promise<boolean> {
        const available = await this.isAvailable();
        if (!available) return false;

        const key = `${CACHE_KEYS.BLACKLIST}${token}`;
        const result = await this.redis.get(key);
        return result !== null;
    }

    /**
     * Caches user data for fast profile lookups
     */
    async cacheUser(userId: string, userData: UserTokenData): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.USER}${userId}`;
        const ttl = Math.floor(tokenConfig.expiry.access / 1000);

        await this.redis.set(key, JSON.stringify(userData), 'EX', ttl);
    }

    /**
     * Gets cached user data
     */
    async getUser(userId: string): Promise<UserTokenData | null> {
        const available = await this.isAvailable();
        if (!available) return null;

        const key = `${CACHE_KEYS.USER}${userId}`;
        const data = await this.redis.get(key);

        if (!data) return null;

        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    /**
     * Invalidates user cache (on profile update)
     */
    async invalidateUser(userId: string): Promise<void> {
        const available = await this.isAvailable();
        if (!available) return;

        const key = `${CACHE_KEYS.USER}${userId}`;
        await this.redis.del(key);
    }

    /**
     * Batch invalidation for user logout (clears all related cache)
     */
    async invalidateUserAuth(userId: string, sid: string, jti?: string): Promise<void> {
        await this.invalidateSession(sid);
        await this.invalidateUser(userId);
        if (jti) {
            await this.invalidateJti(jti);
        }
    }
}

export default AuthCache;
