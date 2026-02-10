/**
 * JWT Service
 * 
 * Secure JWT signing and verification with RS256.
 * 
 * Security principles:
 * - Sign with PRIVATE key (only issuer)
 * - Verify with PUBLIC key (any service)
 * - Strict algorithm enforcement (RS256 only)
 * - Proper claim validation (exp, nbf, iat, iss, aud)
 * - Clock skew tolerance (configurable)
 * - Never log full tokens
 */

import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { jwt as jwtConfig, tokens as tokenConfig, tenancy } from '@/config';
import jwtKeys from './jwt-keys';
import { Unauthorized, InternalServerError } from '../errors';
import {
    AccessTokenPayload,
    RefreshTokenPayload,
    IdTokenPayload
} from '@/types/auth';
import { UserTokenData } from '@/types/data/users';

// Token types
export type TokenType = 'access' | 'refresh' | 'id';

/**
 * Signs a JWT with the private key (RS256)
 * ONLY call this from the auth service (issuer)
 */
export const signToken = <T extends object>(
    payload: T,
    type: TokenType,
    options?: Partial<SignOptions>
): string => {
    try {
        const privateKey = jwtKeys.getPrivateKey();
        const signingOptions = jwtKeys.getSigningOptions();

        const signOptions: SignOptions = {
            ...signingOptions,
            expiresIn: tokenConfig.expiry[type] / 1000, // Convert ms to seconds
            issuer: jwtConfig.issuer,
            audience: jwtConfig.audience,
            notBefore: 0,
            ...options,
        };

        return jwt.sign(payload, privateKey, signOptions);
    } catch (error) {
        console.log(error);
        // Security: Never log the actual error which might contain key info
        console.error('[JWT] Failed to sign token:', type);
        throw new InternalServerError('Failed to generate token');
    }
};

/**
 * Verifies a JWT with the public key (RS256)
 * Can be called from any service
 */
export const verifyToken = <T extends JwtPayload>(
    token: string,
    options?: Partial<VerifyOptions>
): T => {
    try {
        const publicKey = jwtKeys.getPublicKey();
        const verifyOptions = jwtKeys.getVerificationOptions();

        const decoded = jwt.verify(token, publicKey, {
            ...verifyOptions,
            issuer: jwtConfig.issuer,
            audience: jwtConfig.audience,
            clockTolerance: jwtConfig.clockTolerance,
            ...options,
        }) as T;

        // Validate kid if present in header
        const header = jwt.decode(token, { complete: true })?.header;
        if (header?.kid && !jwtKeys.isValidKeyId(header.kid)) {
            throw new Unauthorized('Invalid token', 'Unknown key ID');
        }

        return decoded;
    } catch (error) {
        if (error instanceof Unauthorized) throw error;

        const message = error instanceof Error ? error.message : 'Unknown error';

        // Map JWT errors to appropriate unauthorized messages
        if (message.includes('expired')) {
            throw new Unauthorized('Token expired', 'JWT_EXPIRED');
        }
        if (message.includes('invalid signature')) {
            throw new Unauthorized('Invalid token', 'INVALID_SIGNATURE');
        }
        if (message.includes('jwt malformed')) {
            throw new Unauthorized('Invalid token', 'MALFORMED_TOKEN');
        }
        if (message.includes('audience') || message.includes('issuer')) {
            throw new Unauthorized('Invalid token', 'INVALID_CLAIMS');
        }

        // Security: Log for debugging but don't expose details
        console.error('[JWT] Verification failed:', message.substring(0, 50));
        throw new Unauthorized('Invalid token', 'VERIFICATION_FAILED');
    }
};

/**
 * Decodes a JWT WITHOUT verification (for debugging only)
 * Never use this for authorization decisions
 */
export const decodeToken = <T extends JwtPayload>(token: string): T | null => {
    try {
        return jwt.decode(token) as T;
    } catch {
        return null;
    }
};

/**
 * Generates access token
 */
export const generateAccessToken = (
    sid: string,
    user: UserTokenData
): string => {
    const payload: AccessTokenPayload = {
        typ: 'access',
        sid,
        sub: user.user_id,
        email: user.email,
        ...(tenancy.multiTenant && user.org?.id && { org_id: user.org.id }),
        ...(tenancy.multiTenant && user.org?.role && { role: user.org.role }),
    };

    return signToken(payload, 'access');
};

/**
 * Generates refresh token with unique JTI for one-time use
 */
export const generateRefreshToken = (
    sid: string,
    userId: string,
    jti?: string
): { token: string; jti: string } => {
    const tokenJti = jti || uuidv4();

    const payload: RefreshTokenPayload = {
        typ: 'refresh',
        sid,
        sub: userId,
        jti: tokenJti,
    };

    const token = signToken(payload, 'refresh');
    return { token, jti: tokenJti };
};

/**
 * Generates ID token (for client identity info)
 */
export const generateIdToken = (
    sid: string,
    user: UserTokenData
): string => {
    const payload: IdTokenPayload = {
        typ: 'id',
        sid,
        sub: user.user_id,
        email: user.email,
        name: user.name,
        ...(tenancy.multiTenant && user.org && { org: user.org }),
    };

    return signToken(payload, 'id');
};

/**
 * Generates all tokens for a session
 */
export const generateTokenSet = (
    sid: string,
    user: UserTokenData
): { accessToken: string; refreshToken: string; refreshJti: string; idToken: string } => {
    const accessToken = generateAccessToken(sid, user);
    const { token: refreshToken, jti: refreshJti } = generateRefreshToken(sid, user.user_id);
    const idToken = generateIdToken(sid, user);

    return {
        accessToken,
        refreshToken,
        refreshJti,
        idToken,
    };
};

/**
 * Verifies access token and extracts payload
 * Validates that the token type is 'access'
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
    const payload = verifyToken<AccessTokenPayload>(token);

    // Validate token type to prevent token confusion attacks
    if (payload.typ !== 'access') {
        throw new Unauthorized('Invalid token type', 'INVALID_TOKEN_TYPE');
    }

    return payload;
};

/**
 * Verifies refresh token and extracts payload
 * Validates that the token type is 'refresh'
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
    const payload = verifyToken<RefreshTokenPayload>(token);

    // Validate token type to prevent token confusion attacks
    if (payload.typ !== 'refresh') {
        throw new Unauthorized('Invalid token type', 'INVALID_TOKEN_TYPE');
    }

    // Refresh token MUST have jti
    if (!payload.jti) {
        throw new Unauthorized('Invalid refresh token', 'MISSING_JTI');
    }

    return payload;
};

/**
 * Extracts SID from a token without full verification
 * Used for logout when token might be expired
 */
export const extractSidFromToken = (token: string): string | null => {
    const decoded = decodeToken<AccessTokenPayload | RefreshTokenPayload>(token);
    return decoded?.sid || null;
};

export default {
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
};
