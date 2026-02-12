export type AuditAction =
    | 'login_success'
    | 'login_failed'
    | 'logout'
    | 'signup'
    | 'password_change'
    | 'password_reset_request'
    | 'password_reset_complete'
    | 'session_revoked'
    | 'token_refresh'
    | 'token_reuse_detected'
    | 'account_locked'
    | 'account_unlocked';

export interface AuditLogDB {
    id: string;
    action: AuditAction;
    user_id: string | null;
    email: string | null;
    ip_address: string | null;
    user_agent: string | null;
    metadata: string | null;
    created_at: string;
}

export type InsertAuditLogDB = Omit<AuditLogDB, 'id' | 'created_at'>;
