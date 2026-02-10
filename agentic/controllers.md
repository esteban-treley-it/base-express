# Controllers

Location: `src/controller/`

## auth.ts

Handles user authentication endpoints.

### signUp

Registers a new user.

**Request Body:** `SignUpBody`
```typescript
{
  email: string,      // Valid email
  password: string,   // Min 6 chars
  name: string,
  lastname: string,
  phone: string       // Min 10 chars
}
```

**Flow:**
1. Checks if email already exists → `BadRequest` if true
2. Hashes password with bcrypt
3. Inserts user with `disabled: false`
4. Returns user without password

**Response:** User object (without password)

### login

Authenticates user and creates session.

**Request Body:** `LoginBody`
```typescript
{
  email: string,
  password: string
}
```

**Flow:**
1. Fetches user by email (with password)
2. Compares passwords → `BadRequest` if invalid
3. Generates UUID session ID
4. Generates token set (access, refresh with JTI)
5. Creates session in database with refresh JTI
6. Sets cookies (cookie mode) or returns tokens (bearer mode)
7. Returns user without password

**Response:** User object (without password)  
**Side Effects:** Sets auth cookies, creates `user_sessions` record

### me

Returns current authenticated user.

**Auth Required:** Yes (via `authMiddleware`)

**Response:** `UserTokenData` from `req.user`

## health.ts

Server health check endpoint.

### healthCheck

Checks system health status.

**Response:**
```typescript
{
  postgres: {
    config: { host, port, database, user },
    status: "ok" | error_message
  },
  api: app_config
}
```

## schemas.ts

Zod validation schemas for controllers.

**Schemas:**
- `auth.signUp` - SignUp validation
- `auth.login` - Login validation

Used with `middlewares.schema()` for request validation.
