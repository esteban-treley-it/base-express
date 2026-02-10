/**
 * Security Utilities
 * 
 * Centralized security functions for hashing, lockout, and validation.
 */

import crypto from 'crypto';
import RedisSingleton from '../redis';

/**
 * Hashes a JTI for secure storage
 * Uses SHA-256 which is fast but collision-resistant
 */
export const hashJti = (jti: string): string => {
    return crypto.createHash('sha256').update(jti).digest('hex');
};

// Account lockout configuration
const LOCKOUT_CONFIG = {
    // Per-email lockout (stricter - protects specific accounts)
    email: {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000, // 15 minutes
        lockoutMs: 30 * 60 * 1000, // 30 minutes
        keyPrefix: 'lockout:email:',
    },
    // Per-IP lockout (looser - prevents brute-force across accounts)
    ip: {
        maxAttempts: 20,
        windowMs: 15 * 60 * 1000, // 15 minutes
        lockoutMs: 60 * 60 * 1000, // 1 hour (longer for suspected attackers)
        keyPrefix: 'lockout:ip:',
    },
};

export interface LockoutStatus {
    locked: boolean;
    attemptsRemaining: number;
    lockoutEndsAt?: Date;
    lockedBy?: 'email' | 'ip'; // Which lockout triggered
}

type LockoutType = 'email' | 'ip';

/**
 * Internal helper to record a failed attempt for a specific key
 */
const recordAttemptForKey = async (
    type: LockoutType,
    identifier: string
): Promise<LockoutStatus> => {
    const redis = RedisSingleton.getInstance();
    const redisAvailable = await RedisSingleton.ping();
    const config = LOCKOUT_CONFIG[type];

    if (!redisAvailable) {
        return { locked: false, attemptsRemaining: config.maxAttempts };
    }

    const key = `${config.keyPrefix}${identifier.toLowerCase()}`;
    const lockoutKey = `${key}:locked`;

    // Check if already locked
    const isLocked = await redis.get(lockoutKey);
    if (isLocked) {
        const ttl = await redis.ttl(lockoutKey);
        return {
            locked: true,
            attemptsRemaining: 0,
            lockoutEndsAt: new Date(Date.now() + ttl * 1000),
            lockedBy: type,
        };
    }

    // Increment attempt counter
    const attempts = await redis.incr(key);

    // Set expiry on first attempt
    if (attempts === 1) {
        await redis.expire(key, Math.floor(config.windowMs / 1000));
    }

    // Check if lockout threshold reached
    if (attempts >= config.maxAttempts) {
        await redis.set(lockoutKey, '1', 'EX', Math.floor(config.lockoutMs / 1000));
        await redis.del(key);

        return {
            locked: true,
            attemptsRemaining: 0,
            lockoutEndsAt: new Date(Date.now() + config.lockoutMs),
            lockedBy: type,
        };
    }

    return {
        locked: false,
        attemptsRemaining: config.maxAttempts - attempts,
    };
};

/**
 * Internal helper to check lockout for a specific key
 */
const checkLockoutForKey = async (
    type: LockoutType,
    identifier: string
): Promise<LockoutStatus> => {
    const redis = RedisSingleton.getInstance();
    const redisAvailable = await RedisSingleton.ping();
    const config = LOCKOUT_CONFIG[type];

    if (!redisAvailable) {
        return { locked: false, attemptsRemaining: config.maxAttempts };
    }

    const key = `${config.keyPrefix}${identifier.toLowerCase()}`;
    const lockoutKey = `${key}:locked`;
    const isLocked = await redis.get(lockoutKey);

    if (isLocked) {
        const ttl = await redis.ttl(lockoutKey);
        return {
            locked: true,
            attemptsRemaining: 0,
            lockoutEndsAt: new Date(Date.now() + ttl * 1000),
            lockedBy: type,
        };
    }

    const attempts = parseInt(await redis.get(key) || '0');
    return {
        locked: false,
        attemptsRemaining: Math.max(0, config.maxAttempts - attempts),
    };
};

/**
 * Records a failed login attempt for email AND IP (hybrid approach)
 * Returns the most restrictive lockout status
 */
export const recordFailedAttempt = async (
    email: string,
    ip?: string
): Promise<LockoutStatus> => {
    // Record for email
    const emailResult = await recordAttemptForKey('email', email);

    // If email is locked, return immediately
    if (emailResult.locked) {
        return emailResult;
    }

    // Record for IP if provided
    if (ip) {
        const ipResult = await recordAttemptForKey('ip', ip);
        if (ipResult.locked) {
            return ipResult;
        }
    }

    // Return email result (has fewer attempts remaining typically)
    return emailResult;
};

/**
 * Checks if email OR IP is locked out (hybrid approach)
 * Returns locked if either is locked
 */
export const checkLockout = async (
    email: string,
    ip?: string
): Promise<LockoutStatus> => {
    // Check email lockout first
    const emailResult = await checkLockoutForKey('email', email);
    if (emailResult.locked) {
        return emailResult;
    }

    // Check IP lockout if provided
    if (ip) {
        const ipResult = await checkLockoutForKey('ip', ip);
        if (ipResult.locked) {
            return ipResult;
        }
        // Return the one with fewer attempts remaining
        return emailResult.attemptsRemaining <= ipResult.attemptsRemaining
            ? emailResult
            : ipResult;
    }

    return emailResult;
};

/**
 * Clears lockout status after successful login
 * Only clears email lockout (IP lockout persists to catch attackers)
 */
export const clearLockout = async (email: string): Promise<void> => {
    const redis = RedisSingleton.getInstance();
    const redisAvailable = await RedisSingleton.ping();

    if (!redisAvailable) return;

    const config = LOCKOUT_CONFIG.email;
    const key = `${config.keyPrefix}${email.toLowerCase()}`;
    const lockoutKey = `${key}:locked`;

    await redis.del(key);
    await redis.del(lockoutKey);
};

/**
 * Validates that a table name is in the allowed list
 */
export const ALLOWED_TABLES = [
    'users',
    'user_sessions',
    'error_logs',
    'audit_logs',
    'password_reset_tokens',
    'orgs',
    'org_users',
] as const;

export type AllowedTableName = typeof ALLOWED_TABLES[number];

export const isValidTableName = (table: string): table is AllowedTableName => {
    return ALLOWED_TABLES.includes(table as AllowedTableName);
};

export const validateTableName = (table: string): void => {
    if (!isValidTableName(table)) {
        throw new Error(`Invalid table name: ${table}`);
    }
};
