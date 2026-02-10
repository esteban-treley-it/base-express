# Database Schema

## Tables

### users

Stores system user information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | VARCHAR(30) | First name |
| lastname | VARCHAR(30) | Last name |
| phone | VARCHAR(20) | Phone number |
| email | VARCHAR(30) | Unique email |
| password | VARCHAR(255) | Bcrypt hashed password |
| disabled | BOOLEAN | Soft delete flag |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Type:** `src/types/db/users.ts` → `UserDB`, `InsertUserDB`

### user_sessions

Stores active user sessions with refresh token tracking.

| Column | Type | Description |
|--------|------|-------------|
| sid | UUID | Primary key (session ID) |
| user_id | UUID | FK → users(id), cascade delete |
| refresh_jti | VARCHAR | Current refresh token JTI (for rotation) |
| status | session_status | 'active', 'revoked', or 'expired' |
| user_agent | VARCHAR | Client user agent |
| ip_address | VARCHAR | Client IP address |
| last_seen_at | TIMESTAMP | Last activity timestamp |
| rotated_at | TIMESTAMP | Last refresh token rotation |
| revoked_at | TIMESTAMP | When session was revoked |
| revoke_reason | VARCHAR | Reason for revocation |
| created_at | TIMESTAMP | Creation timestamp |
| expires_at | TIMESTAMP | Session expiry |

**Enums:**
- `session_status`: 'active', 'revoked', 'expired'

**Revoke Reasons:**
- `logout` - User-initiated logout
- `token_reuse` - Refresh token reuse detected (security threat)
- `admin_action` - Administrative revocation
- `password_change` - Password was changed

**Constraint:** `UNIQUE (user_id, sid)`

**Type:** `src/types/db/user_sessions.ts` → `UserSessionDB`, `InsertUserSessionDB`

### error_logs

System error log for debugging.

| Column | Type | Description |
|--------|------|-------------|
| method | VARCHAR | HTTP method |
| route | VARCHAR | Request path |
| message | VARCHAR | Error message |
| body | TEXT | Request body (JSON) |
| headers | TEXT | Request headers (JSON) |
| user_data | TEXT | User info (JSON) |
| created_at | TIMESTAMP | Error timestamp |

**Type:** `src/types/db/error_logs.ts` → `ErrorLogsDB`, `InsertErrorLogsDB`

### audit_logs

Security audit trail for sensitive actions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| action | audit_action | Event type (see enum) |
| user_id | UUID | FK → users(id), nullable |
| email | VARCHAR(255) | For tracking failed logins |
| ip_address | VARCHAR(45) | Client IP (IPv4/IPv6) |
| user_agent | TEXT | Browser/client info |
| metadata | JSONB | Additional context |
| created_at | TIMESTAMP | Event timestamp |

**Enums:**
- `audit_action`: 'login_success', 'login_failed', 'logout', 'signup', 'password_change', 'password_reset_request', 'password_reset_complete', 'session_revoked', 'token_refresh', 'token_reuse_detected', 'account_locked', 'account_unlocked'

**Type:** `src/types/db/audit_logs.ts` → `AuditLogDB`, `InsertAuditLogDB`

### password_reset_tokens

Stores password reset tokens (hashed).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| user_id | UUID | FK → users(id), cascade delete |
| token_hash | VARCHAR(64) | SHA-256 hash of token |
| expires_at | TIMESTAMP | Token expiry (1 hour) |
| used_at | TIMESTAMP | When token was used |
| created_at | TIMESTAMP | Creation timestamp |

**Type:** `src/types/db/password_reset_tokens.ts` → `PasswordResetTokenDB`, `InsertPasswordResetTokenDB`

## Multi-Tenant Tables (Optional)

> These tables are only used when `MULTI_TENANT=true`

### orgs

Stores organizations/tenants.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | VARCHAR(100) | Organization name |
| key | VARCHAR(50) | URL-safe unique identifier |
| disabled | BOOLEAN | Soft delete flag |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### org_users

Maps users to organizations with roles.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| org_id | UUID | FK → orgs(id), cascade delete |
| user_id | UUID | FK → users(id), cascade delete |
| role | user_role | 'admin' or 'member' |
| created_at | TIMESTAMP | Creation timestamp |

**Constraint:** `UNIQUE (org_id, user_id)` - User can only belong once per org

## Type System

All table types are registered in `src/types/db/index.ts`:

```typescript
interface TableSchema {
    users: UserDB;
    user_sessions: UserSessionDB;
    error_logs: ErrorLogsDB;
}
```

This enables type-safe DB operations via the `DB` class.

## SQL Scripts

Initialization scripts: `sql/index.sql`

- Creates `uuid-ossp` extension
- Defines `user_role` enum (`admin`, `member`)
- Creates all tables with constraints
