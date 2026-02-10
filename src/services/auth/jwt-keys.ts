/**
 * JWT Key Management Service
 * 
 * Handles RSA key pair loading, JWKS generation, and secure key distribution.
 * 
 * Security principles:
 * - Private key ONLY used for signing (issuer)
 * - Public key used for verification (can be distributed via JWKS)
 * - Supports key rotation via `kid` (Key ID)
 * - Caches keys in memory to avoid repeated file reads
 */

import crypto from 'crypto';
import fs from 'fs';
import { InternalServerError } from '../errors';
import { security } from '@/config';

const projectRoot = process.cwd();

// Constants
const ALGORITHM = 'RS256';
const KEY_TYPE = 'RSA';
const KEY_USE = 'sig'; // Signature

// Cache for loaded keys
let privateKeyCache: string | null = null;
let publicKeyCache: string | null = null;
let jwksCache: JWKS | null = null;
let keyIdCache: string | null = null;

export interface JWK {
    kty: string;      // Key Type (RSA)
    use: string;      // Key Use (sig)
    alg: string;      // Algorithm (RS256)
    kid: string;      // Key ID
    n: string;        // RSA modulus (base64url)
    e: string;        // RSA exponent (base64url)
}

export interface JWKS {
    keys: JWK[];
}

/**
 * Generates a Key ID (kid) from the public key
 * Uses SHA-256 hash of the public key, truncated to 8 chars
 */
const generateKeyId = (publicKey: string): string => {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    return hash.substring(0, 16);
};

/**
 * Loads the private key from file system or environment variable
 * ONLY call this from the issuer (token generation)
 * 
 * Priority:
 * 1. JWT_PRIVATE_KEY_BASE64 env var (for cloud deployments)
 * 2. File from JWT_SECRET_KEY_PATH
 */
export const getPrivateKey = (): string => {
    if (privateKeyCache) return privateKeyCache;

    // Try base64-encoded env var first (for cloud deployments like Railway)
    const base64Key = process.env.JWT_PRIVATE_KEY_BASE64;
    if (base64Key) {
        try {
            privateKeyCache = Buffer.from(base64Key, 'base64').toString('utf8');
            if (!privateKeyCache.includes('PRIVATE KEY')) {
                throw new InternalServerError('Invalid private key format from JWT_PRIVATE_KEY_BASE64');
            }
            return privateKeyCache;
        } catch (err) {
            if (err instanceof InternalServerError) throw err;
            throw new InternalServerError('Failed to decode JWT_PRIVATE_KEY_BASE64');
        }
    }

    // Fallback to file system
    if (!security.jwtPrivateKeyPath) {
        throw new InternalServerError('JWT_SECRET_KEY_PATH not configured');
    }

    try {
        const keyPath = projectRoot + security.jwtPrivateKeyPath;
        privateKeyCache = fs.readFileSync(keyPath, 'utf8');

        if (!privateKeyCache || !privateKeyCache.includes('PRIVATE KEY')) {
            throw new InternalServerError('Invalid private key format');
        }

        return privateKeyCache;
    } catch (err) {
        if (err instanceof InternalServerError) throw err;
        throw new InternalServerError('Private key file not found or unreadable');
    }
};

/**
 * Loads or derives the public key
 * Can be distributed to any service for token verification
 * 
 * Priority:
 * 1. JWT_PUBLIC_KEY_BASE64 env var (for cloud deployments)
 * 2. File from JWT_PUBLIC_KEY_PATH
 * 3. Derive from private key
 */
export const getPublicKey = (): string => {
    if (publicKeyCache) return publicKeyCache;

    // Try base64-encoded env var first (for cloud deployments like Railway)
    const base64Key = process.env.JWT_PUBLIC_KEY_BASE64;
    if (base64Key) {
        try {
            publicKeyCache = Buffer.from(base64Key, 'base64').toString('utf8');
            if (!publicKeyCache.includes('PUBLIC KEY')) {
                throw new InternalServerError('Invalid public key format from JWT_PUBLIC_KEY_BASE64');
            }
            return publicKeyCache;
        } catch (err) {
            if (err instanceof InternalServerError) throw err;
            // Fall through to other methods
        }
    }

    // Try to load from explicit public key file if configured
    if (security.jwtPublicKeyPath) {
        try {
            const keyPath = projectRoot + security.jwtPublicKeyPath;
            publicKeyCache = fs.readFileSync(keyPath, 'utf8');
            return publicKeyCache;
        } catch {
            // Fall through to derive from private key
        }
    }

    // Derive public key from private key
    const privateKey = getPrivateKey();
    const keyObject = crypto.createPrivateKey(privateKey);
    publicKeyCache = crypto.createPublicKey(keyObject).export({
        type: 'spki',
        format: 'pem'
    }) as string;

    return publicKeyCache;
};

/**
 * Gets the current Key ID
 */
export const getKeyId = (): string => {
    if (keyIdCache) return keyIdCache;
    keyIdCache = generateKeyId(getPublicKey());
    return keyIdCache;
};

/**
 * Converts a PEM public key to JWK format
 */
const pemToJwk = (publicKeyPem: string, kid: string): JWK => {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' });

    return {
        kty: KEY_TYPE,
        use: KEY_USE,
        alg: ALGORITHM,
        kid,
        n: jwk.n as string,
        e: jwk.e as string,
    };
};

/**
 * Generates JWKS (JSON Web Key Set) for public key distribution
 * Endpoint: /.well-known/jwks.json
 */
export const getJWKS = (): JWKS => {
    if (jwksCache) return jwksCache;

    const publicKey = getPublicKey();
    const kid = getKeyId();
    const jwk = pemToJwk(publicKey, kid);

    jwksCache = { keys: [jwk] };
    return jwksCache;
};

/**
 * Clears the key cache (useful for key rotation)
 */
export const clearKeyCache = (): void => {
    privateKeyCache = null;
    publicKeyCache = null;
    jwksCache = null;
    keyIdCache = null;
};

/**
 * Validates that a kid matches our known key
 * Prevents kid injection attacks
 */
export const isValidKeyId = (kid: string): boolean => {
    if (!kid || typeof kid !== 'string') return false;
    return kid === getKeyId();
};

/**
 * Get signing options for JWT
 */
export const getSigningOptions = () => ({
    algorithm: ALGORITHM as 'RS256',
    keyid: getKeyId(),
});

/**
 * Get verification options for JWT
 */
export const getVerificationOptions = () => ({
    algorithms: [ALGORITHM] as ['RS256'],
});

export default {
    getPrivateKey,
    getPublicKey,
    getKeyId,
    getJWKS,
    clearKeyCache,
    isValidKeyId,
    getSigningOptions,
    getVerificationOptions,
};
