/**
 * Rate Limiting (Redis-backed store optional via MODULE_REDIS_RATE_LIMIT=true)
 *
 * With the module off (default) or Redis unconfigured, falls back to
 * express-rate-limit's built-in in-memory store - identical to prior behavior.
 * With it on, limits are shared across processes/instances via Redis, and
 * survive restarts.
 */

import rateLimitMiddleware from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { rateLimit as rateLimitConfig, modules, redis as redisConfig } from '@/config';
import RedisSingleton from './redis';

const useRedis = modules.redisRateLimit && !!redisConfig.url;

const makeStore = (prefix: string) => {
    if (!useRedis) return undefined;
    const redisClient = RedisSingleton.getInstance();
    return new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as Promise<any>,
        prefix,
    });
};

export const generalLimiter = rateLimitMiddleware({
    windowMs: rateLimitConfig.general.windowMs,
    max: rateLimitConfig.general.max,
    message: rateLimitConfig.general.message,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:general:'),
});

export const authLimiter = rateLimitMiddleware({
    windowMs: rateLimitConfig.auth.windowMs,
    max: rateLimitConfig.auth.max,
    message: rateLimitConfig.auth.message,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:auth:'),
    // /refresh is mounted under /api/v1/auth too, but it gets its own (looser) limiter
    // below - refresh happens automatically far more often than login/signup attempts.
    skip: (req) => req.path === '/refresh',
});

export const refreshLimiter = rateLimitMiddleware({
    windowMs: rateLimitConfig.refresh.windowMs,
    max: rateLimitConfig.refresh.max,
    message: rateLimitConfig.refresh.message,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:refresh:'),
});
