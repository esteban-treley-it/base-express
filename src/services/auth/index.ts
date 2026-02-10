/**
 * Auth Services Index
 * 
 * Re-exports all auth-related services for clean imports.
 */

// Core auth utilities
export {
    hashPassword,
    comparePasswords,
    decryptToken,
    getAuthCookies,
    validateTokenStatus,
} from './auth';

// JWT operations
export {
    signToken,
    verifyToken,
    decodeToken,
    generateAccessToken,
    generateRefreshToken,
    generateIdToken,
    generateTokenSet,
    verifyAccessToken,
    verifyRefreshToken,
    extractSidFromToken,
    TokenType,
} from './jwt';
export { default as jwt } from './jwt';

// JWT key management
export {
    getPrivateKey,
    getPublicKey,
    getKeyId,
    getJWKS,
    clearKeyCache,
    isValidKeyId,
    getSigningOptions,
    getVerificationOptions,
    JWK,
    JWKS,
} from './jwt-keys';
export { default as jwtKeys } from './jwt-keys';

// Auth cache
export {
    AuthCache,
    CachedSession,
    CACHE_KEYS,
} from './auth-cache';
export { default as authCache } from './auth-cache';

// Auth middleware
export {
    authMiddleware,
    optionalAuthMiddleware,
    AuthenticatedRequest,
    AuthMiddlewareOptions,
} from './auth-middleware';

// Session ID utilities
export {
    getSidExpirationSQL,
    clearSidFromCookies,
} from './session-id';

// Password reset
export {
    createPasswordResetRequest,
    validateResetToken,
    completePasswordReset,
    cleanupExpiredTokens,
} from './password-reset';
