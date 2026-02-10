CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

create type user_role as enum (
    'admin',
    'member',
)

CREATE TABLE users (
	id UUID primary key default uuid_generate_v4(),
	name VARCHAR(30),
	lastname VARCHAR(30),
	phone VARCHAR(20),
	email VARCHAR(30) UNIQUE,
	password VARCHAR(255),
	disabled BOOLEAN default false,
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP default NOW()
);

-- Session status enum for tracking session lifecycle
CREATE TYPE session_status AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE user_sessions(
	sid UUID primary key,
	user_id UUID references users(id) on delete cascade,
	refresh_jti VARCHAR(100),                      -- JWT ID for refresh token (one-time use validation)
	status session_status DEFAULT 'active',        -- Session state
	created_at TIMESTAMP DEFAULT NOW(),
	expires_at TIMESTAMP,
	last_seen_at TIMESTAMP,                        -- Last token validation
	rotated_at TIMESTAMP,                          -- Last refresh token rotation
	revoked_at TIMESTAMP,                          -- When session was revoked
	revoke_reason VARCHAR(100),                    -- Why: logout, token_reuse, admin_action, password_change
	CONSTRAINT user_session_unique UNIQUE (user_id, sid)
);

-- ============================================
-- MULTI-TENANT TABLES (Optional: MULTI_TENANT=true)
-- ============================================

CREATE TABLE orgs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    key VARCHAR(50) UNIQUE NOT NULL,          -- URL-safe identifier
    disabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE org_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role user_role DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT org_user_unique UNIQUE (org_id, user_id)
);

-- ============================================
-- ERROR LOGGING
-- ============================================

CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    method VARCHAR(10) NOT NULL,
    route VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    body TEXT,
    headers TEXT,
    user_data TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- AUDIT LOGGING
-- ============================================

CREATE TYPE audit_action AS ENUM (
    'login_success',
    'login_failed',
    'logout',
    'signup',
    'password_change',
    'password_reset_request',
    'password_reset_complete',
    'session_revoked',
    'token_refresh',
    'token_reuse_detected',
    'account_locked',
    'account_unlocked'
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action audit_action NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255),                    -- For tracking failed logins
    ip_address VARCHAR(45),                -- IPv4 or IPv6
    user_agent TEXT,
    metadata JSONB,                        -- Additional context
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PASSWORD RESET TOKENS
-- ============================================

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,       -- SHA-256 hash of token
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,                     -- Set when token is used
    created_at TIMESTAMP DEFAULT NOW()
);
