/**
 * Standard JWT Claims (RFC 7519)
 */
export interface JWTStandardClaims {
    iss: string;      // Issuer
    sub: string;      // Subject (user ID)
    aud: string;      // Audience
    exp: number;      // Expiration time (Unix timestamp)
    nbf: number;      // Not before (Unix timestamp)
    iat: number;      // Issued at (Unix timestamp)
    jti: string;      // JWT ID (unique identifier)
}

/**
 * Token type discriminator
 */
export type TokenType = 'access' | 'refresh' | 'id';

/**
 * Access Token Payload
 * Short-lived token for API authorization
 */
export interface AccessTokenPayload extends Partial<JWTStandardClaims> {
    typ: 'access';    // Token type discriminator
    sid: string;      // Session ID
    sub: string;      // User ID
    email: string;
    org_id?: string;
    role?: string;
}

/**
 * Refresh Token Payload  
 * Long-lived token for obtaining new access tokens
 * Contains jti for one-time use validation
 */
export interface RefreshTokenPayload extends Partial<JWTStandardClaims> {
    typ: 'refresh';   // Token type discriminator
    sid: string;      // Session ID
    sub: string;      // User ID
    jti: string;      // Required: JWT ID for rotation tracking
}

/**
 * ID Token Payload
 * Identity information for the client (optional for UI)
 */
export interface IdTokenPayload extends Partial<JWTStandardClaims> {
    typ: 'id';        // Token type discriminator
    sid: string;
    sub: string;      // User ID
    email: string;
    name?: string;
    org?: {
        id?: string;
        role?: string;
    };
}

// Legacy types (deprecated, for backward compatibility)
/** @deprecated Use AccessTokenPayload */
export interface IdTokenData {
    sid: string
    user: {
        id: string
        email: string,
        org: {
            id?: string,
            role?: string
        }
    }
}

/** @deprecated Use AccessTokenPayload */
export interface AccessTokenData {
    sid: string
    user: {
        id: string
        email: string,
    }
}

/** @deprecated Use RefreshTokenPayload */
export interface RefreshTokenData {
    sid: string
    user: {
        id: string
        email: string
        org_id: string
    }
}