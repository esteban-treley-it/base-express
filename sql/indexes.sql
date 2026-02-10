-- Centralized index definitions
-- Run after base schema (index.sql) has been applied

-- user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_jti ON user_sessions(refresh_jti) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id_status ON user_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE status = 'active';

-- org_users
CREATE INDEX IF NOT EXISTS idx_org_users_user_id ON org_users(user_id);
CREATE INDEX IF NOT EXISTS idx_org_users_org_id ON org_users(org_id);

-- error_logs
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_email ON audit_logs(email) WHERE email IS NOT NULL;

-- password_reset_tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status_expires ON user_sessions(status, expires_at);
