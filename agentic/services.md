# Services

Location: `src/services/`

## jwt-keys.ts

RSA key management and JWKS generation.

**Functions:**
- `getPrivateKey()` - Returns RSA private key (for signing)
- `getPublicKey()` - Returns RSA public key (for verification)
- `getKeyId()` - Returns key ID (kid) derived from public key hash
- `getJWKS()` - Returns public key in JWKS format
- `isValidKeyId(kid)` - Validates a key ID matches current key

**Security:**
- Private key ONLY used for token signing
- Public key distributed via JWKS endpoint
- Keys loaded from `/keys/` directory
- Cached in memory after first load

## jwt.ts

JWT signing and verification with RS256.

**Functions:**
- `signToken(payload, expiresIn)` - Signs token with private key
- `verifyToken(token)` - Verifies token with public key
- `generateAccessToken(sid, user)` - Creates short-lived access token
- `generateRefreshToken(sid, userId)` - Creates refresh token with JTI
- `generateTokenSet(sid, user)` - Creates access + refresh token pair
- `verifyAccessToken(token)` - Validates and decodes access token
- `verifyRefreshToken(token)` - Validates and decodes refresh token

**Token Claims:**
- Access: `sid`, `sub`, `email`, `iss`, `aud`, `iat`, `exp`
- Refresh: `sid`, `sub`, `jti`, `iss`, `aud`, `iat`, `exp`

## auth-middleware.ts

Request authentication middleware.

**Function:** `authMiddleware(req, res, next)`

**Flow:**
1. Extracts Bearer token from Authorization header (or cookie in cookie mode)
2. Verifies token signature with public key (RS256)
3. Validates session in Redis cache (falls back to DB)
4. Loads user data and attaches to request

## auth.ts

Authentication and token management.

**Functions:**
- `hashPassword(password)` - Bcrypt hash with configurable salt rounds
- `comparePasswords(password, hash)` - Bcrypt comparison
- `generateToken(type, payload)` - JWT generation with RS256
- `generateTokens(sid, user)` - Creates access, refresh, and id tokens
- `createCookies(res, tokens)` - Sets HTTP-only secure cookies
- `decryptToken(token)` - JWT verification
- `getAuthCookies(req)` - Extracts auth cookies from request
- `validateTokenStatus(tokens)` - Returns `valid`, `expired`, or `invalid`

## auth-cache.ts

Redis-based authentication caching with fallback.

**Class:** `AuthCache`
- Caches verified users in Redis (TTL: 10 min)
- Falls back to token validation if Redis unavailable
- Prevents duplicate validations with in-progress map
- Auto-refreshes tokens when access token expired

**Methods:**
- `verifyRefreshToken()` - Validates refresh token and session
- `validateTokens(res)` - Full token validation with refresh
- `updateUserSession()` - Extends session expiry
- `execute(res)` - Main entry point for auth validation

## db.ts

PostgreSQL database wrapper with connection pooling.

**Class:** `DB`

**Connection Management:**
- `setConnection(fn)` - Wraps operations with connection handling
- `getClient()` - Returns active PoolClient
- `beginTransaction()` / `commit()` / `rollback()` - Transaction support

**Query Methods:**
- `query(sql, params)` - Raw SQL query
- `insert(table, values[], options?)` - Type-safe insert with RETURNING
- `find(table, where)` - SELECT with WHERE conditions
- `update(table, values, where, options?)` - UPDATE with conditions
- `delete(table, where, options?)` - DELETE with conditions
- `ping()` - Connection health check

**Where Clause Operators:**
- Direct equality
- `$gt` / `$lt` - Greater/less than
- Array values → `ANY()` clause

## errors.ts

Centralized error handling.

**Base Class:** `BaseError` - Extends Error with status and data

**Error Classes:**
| Class | Status |
|-------|--------|
| `NotFound` | 404 |
| `BadRequest` | 400 |
| `Unauthorized` | 401 |
| `Forbidden` | 403 |
| `InternalServerError` | 500 |
| `ServiceUnavailable` | 523 |

**Functions:**
- `errorHandler(req, res, next)` - Express error handler, logs to `error_logs`

## redis.ts

Redis singleton connection.

**Class:** `RedisSingleton`
- `getInstance()` - Returns shared Redis connection
- `ping()` - Health check

## request.ts

Express middleware and request handling.

**Functions:**
- `handleRequest(fn)` - Wraps controller, handles response/errors

**Middlewares:**
- `db` - Attaches new DB instance to request
- `schema(zodSchema)` - Validates request body with Zod
- `auth` - Full authentication middleware

## session-id.ts

Session and cookie utilities.

**Functions:**
- `getSidExpirationSQL()` - Returns expiry timestamp for DB
- `clearSidFromCookies(res)` - Clears all auth cookies from response

## zod.ts

Zod validation utilities (currently empty, reserved for shared utilities).

## security.ts

Security utilities for hashing and validation.

**Functions:**
- `hashJti(jti)` - SHA-256 hash for JTI storage
- `recordFailedAttempt(email, ip?)` - Records failed login, returns lockout status
- `checkLockout(email, ip?)` - Checks if email/IP is locked out
- `clearLockout(email)` - Clears lockout after successful login
- `validateTableName(table)` - Validates table name against whitelist
- `isValidTableName(table)` - Type guard for allowed tables

**Configuration:**
- Email lockout: 5 attempts → 30 min
- IP lockout: 20 attempts → 1 hour
- Uses Redis for state

## audit.ts

Security audit logging service.

**Functions:**
- `logAuditEvent(db, action, context)` - Core logging function
- `getAuditContext(req)` - Extract IP/UA from request
- Convenience functions for each event type:
  - `auditLoginSuccess`, `auditLoginFailed`
  - `auditLogout`, `auditSignup`
  - `auditPasswordChange`, `auditPasswordResetRequest`, `auditPasswordResetComplete`
  - `auditSessionRevoked`, `auditTokenRefresh`
  - `auditTokenReuseDetected`, `auditAccountLocked`

## password-reset.ts

Secure password reset flow.

**Functions:**
- `createPasswordResetRequest(db, email)` - Generates reset token
- `validateResetToken(db, token)` - Validates token is valid/unused/unexpired
- `completePasswordReset(db, token, newPassword)` - Updates password, revokes sessions
- `cleanupExpiredTokens(db)` - Removes old tokens (for scheduled cleanup)

**Security:**
- 256-bit random tokens
- SHA-256 hash stored in DB
- 1 hour expiry
- One-time use
- All sessions revoked on reset

## https-enforcement.ts

HTTPS and HSTS middleware.

**Functions:**
- `httpsEnforcement(req, res, next)` - Redirects HTTP→HTTPS in production
- `hstsMiddleware(req, res, next)` - Adds HSTS header

