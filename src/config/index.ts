import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config()

// Security: fail closed. Only these NODE_ENV values are treated as development; anything else
// (including unset or a typo) gets production behavior: secure cookies, HTTPS enforcement,
// no debug tokens in responses, mandatory DB password.
const DEV_ENVS = ['development', 'local', 'test'];
const isDev = DEV_ENVS.includes(process.env.NODE_ENV || '');

export const app = {
    isDev,
    port: process.env.PORT || 8000,
    host: process.env.HOST || 'localhost',
    bodyLimit: '10kb',
    debug: process.env.APP_DEBUG === 'true' || process.env.DEBUG === 'true',
    // Number of reverse-proxy hops to trust when resolving req.ip / req.protocol (0 = trust none).
    // Must match the real topology: too high lets clients spoof X-Forwarded-For, too low makes
    // every user share the proxy's IP. Defaults to 1 outside development (single load balancer).
    trustProxyHops: (() => {
        const hops = Number(process.env.TRUST_PROXY_HOPS || (isDev ? 0 : 1));
        return Number.isInteger(hops) && hops >= 0 ? hops : 0;
    })(),
    // Numeric log level for src/services/logger.ts: error=0, warn=1, info=2, debug=3
    logLevel: Number(process.env.LOG_LEVEL ?? (isDev ? 3 : 2)),
    // Public URL of the frontend app, used to build links in emails (verification, password reset)
    publicUrl: process.env.NEXT_APP_URL || process.env.REACT_APP_URL || 'http://localhost:3000',
}

/**
 * Feature module toggles.
 *
 * Each module defaults to OFF so forking this template doesn't change behavior
 * until someone opts in. Enable via env var (MODULE_X=true) or by dropping a
 * modules.json file (see modules.example.json) that overrides these flags without
 * touching .env - useful for local toggling. JSON wins over env vars when present.
 */
type ModuleFlags = {
    emailVerification: boolean;
    googleAuth: boolean;
    passwordChange: boolean;
    redisRateLimit: boolean;
};

const readModulesJsonOverride = (): Partial<ModuleFlags> => {
    const file = process.env.MODULES_CONFIG_PATH || path.join(process.cwd(), 'modules.json');
    if (!fs.existsSync(file)) return {};
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
}

const bool = (value: string | undefined): boolean => value === 'true';

export const modules: ModuleFlags = {
    emailVerification: bool(process.env.MODULE_EMAIL_VERIFICATION),
    googleAuth: bool(process.env.MODULE_GOOGLE_AUTH),
    passwordChange: bool(process.env.MODULE_PASSWORD_CHANGE),
    redisRateLimit: bool(process.env.MODULE_REDIS_RATE_LIMIT),
}

// Only real JSON booleans count: a string like "false" is truthy and would silently turn a module on.
const modulesOverride = readModulesJsonOverride();
for (const key of Object.keys(modules) as (keyof ModuleFlags)[]) {
    if (typeof modulesOverride[key] === 'boolean') modules[key] = modulesOverride[key] as boolean;
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
    refresh: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 60,
        message: { error: 'Too many refresh requests, please slow down.' },
    },
}

export const db = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    // Security: no default credentials outside development
    password: process.env.POSTGRES_PASSWORD || (() => {
        if (!isDev) throw new Error('POSTGRES_PASSWORD must be set when NODE_ENV is not development/local/test');
        return 'password';
    })(),
    database: process.env.POSTGRES_DB || 'base-express',
}

export const tokens = {
    expiry: {
        access: 2 * 60 * 1000,
        refresh: 7 * 24 * 60 * 60 * 1000,
        id: 15 * 60 * 1000,
    },
    // Refresh cookie is sent to /refresh and /logout only (logout must be able to revoke the session
    // even after the short-lived access token has expired).
    refreshCookiePath: '/api/v1/auth',
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

// Google Sign-In (Optional: MODULE_GOOGLE_AUTH=true). Empty clientId keeps /auth/google unmounted
// even if the module flag is on - see routes/auth.ts.
export const google = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
}

// Transactional email (Optional: used by MODULE_EMAIL_VERIFICATION and MODULE_PASSWORD_CHANGE).
// Falls back to logging the token instead of sending an email when resendApiKey is unset,
// so the existing forgot-password flow keeps working with zero config.
export const email = {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.ONBOARDING_EMAIL || 'onboarding@resend.dev',
    appUrl: app.publicUrl,
}
