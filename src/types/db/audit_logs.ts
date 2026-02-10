/**
 * Audit Log Types
 * 
 * For tracking security-sensitive actions
 */

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
    user_id: string | null;        // null for failed logins with unknown email
    email: string | null;          // For tracking failed login attempts
    ip_address: string | null;
    user_agent: string | null;
    metadata: string | null;       // JSON string with additional context
    created_at: string;
}

export type InsertAuditLogDB = Omit<AuditLogDB, 'id' | 'created_at'>;
