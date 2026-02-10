# Security

## Authentication

Session-based authentication using JWT tokens with RS256 algorithm. Supports two modes controlled by `AUTH_MODE` environment variable:

| Mode | Value | Description |
|------|-------|-------------|
| **Cookies** | `cookies` | Default. Tokens stored in HTTP-only cookies |
| **Bearer** | `bearer` | Tokens returned in response, sent via Authorization header |

### Token Types

| Token | Purpose | Expiry | Cookie Name |
|-------|---------|--------|-------------|
| Access Token | Short-lived auth | 2 min | `x-access-token` |
| Refresh Token | Token renewal | 7 days | `x-refresh-token` |
| ID Token | User identity | 15 min | `x-id-token` |
| Session ID (SID) | Session identifier | 7 days | Embedded in JWT `sid` claim |

### JWT Security (RS256)

**Key Management:**
- **Private Key**: Used ONLY for signing tokens (issuer)
- **Public Key**: Used for verification, distributed via JWKS endpoint
- Keys stored in `/keys/` directory:
  - `private.pem` - RSA private key (keep secret)
  - `public.pem` - RSA public key (optional, derived from private)
- Key ID (`kid`) generated from SHA-256 hash of public key

**Token Claims:**
```typescript
// Access Token Payload
{
  typ: 'access';        // Token type discriminator (prevents token confusion)
  sid: string;          // Session ID
  sub: string;          // User ID
  email: string;        // User email
  iss: string;          // Issuer
  aud: string;          // Audience
  iat: number;          // Issued at
  exp: number;          // Expiration
}

// Refresh Token Payload
{
  typ: 'refresh';       // Token type discriminator (prevents token confusion)
  sid: string;          // Session ID
  sub: string;          // User ID
  jti: string;          // JWT ID (unique, for one-time use)
  iss: string;          // Issuer
  aud: string;          // Audience
  iat: number;          // Issued at
  exp: number;          // Expiration
}

// ID Token Payload
{
  typ: 'id';            // Token type discriminator (prevents token confusion)
  sid: string;          // Session ID
  sub: string;          // User ID
  email: string;        // User email
  name?: string;        // User name
  org?: object;         // Organization info
  iss: string;          // Issuer
  aud: string;          // Audience
  iat: number;          // Issued at
  exp: number;          // Expiration
}
```

**Token Type Validation:**
- Each token includes a `typ` claim to prevent token confusion attacks
- Access token verification rejects tokens where `typ !== 'access'`
- Refresh token verification rejects tokens where `typ !== 'refresh'`

**JWKS Endpoint:** `GET /auth/.well-known/jwks.json`
- Returns public key in JWKS format for external verification

### Refresh Token Rotation

Security implementation following OAuth 2.0 best practices:

1. **One-Time Use**: Each refresh token has a unique `jti` stored in database
2. **Rotation**: On refresh, new access + refresh tokens issued, old `jti` invalidated
3. **Reuse Detection**: If a previously-used `jti` is presented:
   - ALL user sessions are revoked immediately
   - Indicates potential token theft

### Session States

| Status | Description |
|--------|-------------|
| `active` | Valid session |
| `revoked` | Manually revoked or security event |
| `expired` | Past expiration time |

**Revocation Reasons:**
- `logout` - User-initiated logout
- `token_reuse` - Refresh token reuse detected (security threat)
- `admin_action` - Administrative revocation
- `password_change` - Password was changed

### Components

- `src/services/jwt-keys.ts` - RSA key management, JWKS generation
- `src/services/jwt.ts` - Token signing (private key) and verification (public key)
- `src/services/auth-middleware.ts` - Request authentication middleware
- `src/services/auth.ts` - Password hashing, cookie creation
- `src/services/auth-cache.ts` - Redis-based session caching with fallback
- `src/controller/auth.ts` - Auth endpoints (signUp, login, logout, refresh, me, jwks)
- `src/data/user-sessions.ts` - Session persistence with rotation and reuse detection
- `src/data/users.ts` - User data queries

### Authentication Flow

#### Bearer Mode (Recommended)

1. **Login:**
   - User sends `POST /auth/login` with email/password
   - Credentials validated against database (bcrypt)
   - Session created with refresh token JTI
   - Access token returned (short-lived, 2 min)
   - Refresh token returned (long-lived, 7 days)

2. **Request Validation:**
   - Send `Authorization: Bearer <access_token>`
   - `authMiddleware` verifies token signature with public key
   - Validates session is active in database/Redis
   - Returns user data to request handler

3. **Token Refresh:**
   - When access token expires, send `POST /auth/refresh`
   - Body: `{ "refreshToken": "<refresh_token>" }`
   - Server validates:
     - Signature valid (public key)
     - JTI matches database (one-time use)
     - Session is active
   - Returns new access + refresh tokens
   - Old JTI invalidated, new JTI stored

4. **Logout:**
   - Send `POST /auth/logout` with valid access token
   - Session revoked in database
   - Cache cleared

#### Cookie Mode (Default)

1. **Login:**
   - User sends email/password
   - Tokens set as HTTP-only cookies
   - Session persisted in `user_sessions` table

2. **Request Validation:**
   - `authMiddleware` extracts cookies
   - Verifies tokens with public key
   - Checks Redis cache, falls back to DB
   - Auto-refreshes if access token expired

3. **Logout:**
   - Session invalidated in database
   - Cookies cleared from response

### Password Security

- Hashed using bcrypt with configurable salt rounds (`BCRYPT_SALT_ROUNDS`)
- Never returned in API responses
- **Requirements (OWASP compliant):**
  - Minimum 12 characters
  - Maximum 128 characters  
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character

## Authorization

**Multi-Tenant Mode:** `MULTI_TENANT=true`

When enabled, users can belong to organizations with roles:
- Queries join `org_users` and `orgs` tables
- User data includes `org: { id, name, key, role }`
- Tokens include org_id and role claims

When disabled (default), org-related tables are not queried.

## Security Middleware Stack

Applied in `server.ts` in order:

1. **Helmet** - Security headers
2. **CORS** - Cross-origin configuration
3. **Cookie Parser** - Cookie parsing
4. **Rate Limiting** - DoS protection
   - General: 100 req/15min
   - Auth: 10 req/15min
5. **Body Limits** - 10kb max

## Error Handling

All errors logged to `error_logs` table via `src/services/errors.ts`:
- Request method, route
- Safe headers only (content-type, user-agent)
- Sanitized body (passwords/tokens redacted)
- User ID only (not full user data)

### Error Classes

| Class | Status | Use Case |
|-------|--------|----------|
| `BadRequest` | 400 | Invalid input |
| `Unauthorized` | 401 | Not authenticated |
| `Forbidden` | 403 | Not authorized |
| `NotFound` | 404 | Resource not found |
| `InternalServerError` | 500 | Server errors |
| `ServiceUnavailable` | 523 | External service down |

## Audit Logging

Security-sensitive actions are logged to `audit_logs` table for compliance and forensics.

### Logged Events

| Action | Description |
|--------|-------------|
| `login_success` | Successful login |
| `login_failed` | Failed login attempt |
| `logout` | User logout |
| `signup` | New user registration |
| `password_change` | Password changed |
| `password_reset_request` | Reset requested |
| `password_reset_complete` | Reset completed |
| `session_revoked` | Session manually revoked |
| `token_refresh` | Token refreshed |
| `token_reuse_detected` | Possible token theft |
| `account_locked` | Too many failed attempts |

### Audit Log Fields

- `action` - Event type
- `user_id` - User (if known)
- `email` - For failed logins
- `ip_address` - Client IP
- `user_agent` - Browser/client
- `metadata` - Additional context (JSON)
- `created_at` - Timestamp

## Password Reset

Secure password reset flow with token-based verification.

### Flow

1. **Request Reset:** `POST /auth/password-reset/request` with email
2. **Generate Token:** 256-bit random token, SHA-256 hash stored in DB
3. **Send Email:** Token sent via email (placeholder - needs email service)
4. **Complete Reset:** `POST /auth/password-reset/complete` with token + new password
5. **Revoke Sessions:** All user sessions revoked (force re-login)

### Configuration

| Setting | Value |
|---------|-------|
| Token expiry | 1 hour |
| Token entropy | 256 bits |
| Storage | SHA-256 hash |
| Sessions | Revoked on reset |

## Security Audit

**Last Audit:** 2026-02-09  
**Plan:** [security-audit-remediation.md](../plans/security-audit-remediation.md)

### Implemented Controls
- ✅ CORS configuration
- ✅ HTTP-only cookies with Secure/SameSite
- ✅ Security headers (Helmet with custom CSP)
- ✅ Rate limiting
- ✅ Input validation (Zod schemas)
- ✅ Sanitized error logging
- ✅ Strong password policy
- ✅ RS256 JWT with private/public key separation
- ✅ Refresh token rotation (one-time use JTI)
- ✅ Token reuse detection with session revocation
- ✅ JWKS endpoint for public key distribution
- ✅ Access token only in requests (no refresh token exposure)
- ✅ **JTI hash in database** (SHA-256, prevents token reuse if DB compromised)
- ✅ **Table name whitelist** (SQL injection prevention for dynamic table names)
- ✅ **Multi-stage Dockerfile** (keys mounted at runtime, not in image)
- ✅ **HTTPS enforcement** (redirect + HSTS in production)
- ✅ **Content Security Policy** (XSS mitigation via Helmet)
- ✅ **Account lockout** (email + IP híbrido via Redis)
- ✅ **Audit logging** (login, logout, password reset, token reuse)
- ✅ **Password reset flow** (secure token, 1hr expiry, session revocation)
- ✅ **Permissions-Policy header** (disables camera, mic, geolocation, etc.)

### Security Components

| Component | File | Purpose |
|-----------|------|---------|
| JTI Hashing | `src/services/security.ts` | Hash refresh token JTI before DB storage |
| Account Lockout | `src/services/security.ts` | Track/block failed login attempts |
| Table Validation | `src/services/security.ts` | Prevent SQL injection via table names |
| HTTPS Enforcement | `src/services/https-enforcement.ts` | Redirect HTTP→HTTPS + HSTS |
| Audit Logging | `src/services/audit.ts` | Log security-sensitive actions |
| Password Reset | `src/services/password-reset.ts` | Secure password reset with tokens |

### Account Lockout Configuration

**Estrategia híbrida:** Lockout por email (protege cuentas) + por IP (previene brute-force distribuido)

| Setting | Email | IP |
|---------|-------|-----|
| Max attempts | 5 | 20 |
| Window | 15 min | 15 min |
| Lockout duration | 30 min | 1 hora |
| Clear on success | ✅ Sí | ❌ No (persiste) |
| Storage | Redis | Redis |

**Comportamiento:**
- Si email está bloqueado → bloqueado
- Si IP está bloqueada → bloqueado  
- Login exitoso limpia lockout de email (IP persiste para detectar atacantes)

### CSP Directives

```javascript
contentSecurityPolicy: {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
    }
}
```

### Pending
- ⏳ Email verification (magic link)
- ⏳ Password breach check (HIBP API)
- ⏳ 2FA/MFA
