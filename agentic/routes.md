# Routes (API)

Location: `src/routes/`

Base path: `/api/v1`

## index.ts

Main router that groups all routes.

**Mounted Routes:**
- `/auth` → `authRouter`
- `/health` → `healthCheck`

## auth.ts

Authentication routes.

| Method | Path | Middleware | Controller | Description |
|--------|------|------------|------------|-------------|
| POST | `/auth/sign-up` | `schema(auth.signUp)` | `signUp` | Register new user |
| POST | `/auth/login` | `schema(auth.login)` | `login` | Authenticate user |
| GET | `/auth/me` | `auth` | `me` | Get current user |
| POST | `/auth/logout` | `auth` | `logout` | End session |
| POST | `/auth/refresh` | `schema(auth.refresh)` | `refresh` | Refresh tokens |
| POST | `/auth/password-reset/request` | `schema(auth.passwordResetRequest)` | `requestPasswordReset` | Request password reset |
| POST | `/auth/password-reset/complete` | `schema(auth.passwordResetComplete)` | `resetPassword` | Complete password reset |
| GET | `/auth/.well-known/jwks.json` | - | `jwks` | Public key (JWKS) |

### POST /api/v1/auth/sign-up

Registers a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John",
  "lastname": "Doe",
  "phone": "1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John",
    "lastname": "Doe",
    "phone": "1234567890",
    "disabled": false
  }
}
```

### POST /api/v1/auth/login

Authenticates user and creates session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response - Cookie Mode (default, AUTH_MODE=cookies):**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

**Cookies Set:**
- `x-access-token`
- `x-refresh-token`
- `x-id-token`

**Response - Bearer Mode (AUTH_MODE=bearer):**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": "uuid",
      "name": "John Doe",
      "email": "user@example.com"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Using Access Token:**
```
Authorization: Bearer <accessToken>
```

### GET /api/v1/auth/me

Returns current authenticated user.

**Auth Required:** Yes (cookies or Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

**Note:** When access token expires, use `/auth/refresh` endpoint with refresh token to get new tokens.

### POST /api/v1/auth/logout

Ends the current session.

**Auth Required:** Yes (cookies or Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

**Cookie Mode:** Clears all auth cookies.
**Bearer Mode:** Invalidates session in database and cache.

### POST /api/v1/auth/refresh

Refreshes access and refresh tokens (token rotation).

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Security:**
- Validates refresh token signature (RS256 with public key)
- Checks JTI against database (one-time use)
- Verifies session is active
- Issues new tokens with new JTI
- Invalidates old JTI

**Reuse Detection:**
If a previously-used refresh token JTI is presented, ALL user sessions are revoked immediately (indicates potential token theft).

### POST /api/v1/auth/password-reset/request

Requests a password reset. Always returns success to prevent email enumeration.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "If an account exists with this email, a reset link has been sent."
  }
}
```

**Note:** In development, token is included in response for testing.

### POST /api/v1/auth/password-reset/complete

Completes password reset with token. Revokes all user sessions.

**Request:**
```json
{
  "token": "64-char-hex-token",
  "password": "NewSecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Password has been reset. Please log in with your new password."
  }
}
```

**Errors:**
- `400` - Invalid or expired token
- `400` - Password doesn't meet requirements

### GET /api/v1/auth/.well-known/jwks.json

Returns the public key in JWKS format for external token verification.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": "abc123...",
        "n": "base64url-encoded-modulus",
        "e": "AQAB"
      }
    ]
  }
}
```

## Health Check

| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | `/health` | `healthCheck` | Server status |

### GET /api/v1/health

Returns system health status.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "postgres": {
      "config": { "host": "...", "port": 5432, "database": "...", "user": "..." },
      "status": "ok"
    },
    "api": { ... }
  }
}
```
