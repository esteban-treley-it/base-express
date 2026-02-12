export type SessionStatus = 'active' | 'revoked' | 'expired';

export interface UserSessionDB {
    sid: string;
    user_id: string | null;
    refresh_jti: string | null;
    status: SessionStatus;
    created_at: string;
    expires_at: string | null;
    last_seen_at: string | null;
    rotated_at: string | null;
    revoked_at: string | null;
    revoke_reason: string | null;
}

export type InsertUserSessionDB = Pick<UserSessionDB, 'sid' | 'user_id' | 'refresh_jti' | 'expires_at'>;

export type RevokeReason = 'logout' | 'token_reuse' | 'admin_action' | 'password_change';
