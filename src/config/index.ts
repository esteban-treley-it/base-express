import dotenv from 'dotenv';

dotenv.config()

export const app = {
    port: process.env.PORT || 8000,
    host: process.env.HOST || 'localhost',
    bodyLimit: '10kb',
    debug: process.env.APP_DEBUG === 'true' || process.env.DEBUG === 'true',
}

export const tenancy = {
    multiTenant: process.env.MULTI_TENANT === 'true',
}

export const cors = {
    origin: process.env.REACT_APP_URL || 'http://localhost:8000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}

export const security = {
    saltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    jwtPrivateKeyPath: process.env.JWT_SECRET_KEY_PATH || '',
    jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || '', // Optional: if not set, derived from private
}

export const jwt = {
    issuer: process.env.JWT_ISSUER || 'base-express',
    audience: process.env.JWT_AUDIENCE || 'base-express-api',
    clockTolerance: Number(process.env.JWT_CLOCK_TOLERANCE) || 30, // seconds
}

export const rateLimit = {
    general: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: { error: 'Too many requests, please try again later.' },
    },
    auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10,
        message: { error: 'Too many authentication attempts, please try again later.' },
    },
}

export const db = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'base-express',
}

export const tokens = {
    expiry: {
        access: 2 * 60 * 1000,
        refresh: 7 * 24 * 60 * 60 * 1000,
        id: 15 * 60 * 1000,
    },
    names: {
        access: 'x-access-token',
        refresh: 'x-refresh-token',
        id: 'x-id-token',
    }
}

export const redis = {
    url: process.env.REDIS_URL_AUTH || '',
    cacheTTL: 10 * 60, // 10 minutes in seconds
}

export const auth = {
    mode: (process.env.AUTH_MODE || 'cookies') as 'bearer' | 'cookies',
    multiTenant: process.env.MULTI_TENANT === 'true', // Enable org_users/orgs tables
}
