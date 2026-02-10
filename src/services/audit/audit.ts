/**
 * Audit Logging Service
 * 
 * Logs security-sensitive actions for compliance and forensics.
 * All methods are static for easy usage without instantiation.
 * 
 * Logged actions:
 * - Authentication: login, logout, signup
 * - Security events: password change, token reuse, lockouts
 * - Session management: revocation, refresh
 */

import DB from '@/services/db';
import { AuditAction, InsertAuditLogDB } from '@/types/db/audit_logs';

export interface AuditContext {
    userId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Audit class for logging security-sensitive actions
 * 
 * Usage:
 * ```typescript 
 * const ctx = Audit.getContextFromRequest(req);
 * Audit.loginSuccess(db, userId, email, ctx);
 * ```
 */
export class Audit {
    /**
     * Core logging method - fails silently to not disrupt main flow
     */
    private static async log(db: DB, action: AuditAction, context: AuditContext): Promise<void> {
        try {
            const entry: InsertAuditLogDB = {
                action,
                user_id: context.userId || null,
                email: context.email || null,
                ip_address: context.ip || null,
                user_agent: context.userAgent?.substring(0, 500) || null,
                metadata: context.metadata ? JSON.stringify(context.metadata) : null,
            };

            await db.insert('audit_logs', [entry]);
        } catch (error) {
            console.error('[AUDIT] Failed to log event:', action, error);
        }
    }

    // ==================== Authentication Events ====================

    static loginSuccess(db: DB, userId: string, email: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'login_success', { ...ctx, userId, email });
    }

    static loginFailed(db: DB, email: string, ctx: Partial<AuditContext> = {}, reason?: string): Promise<void> {
        return Audit.log(db, 'login_failed', {
            ...ctx,
            email,
            metadata: reason ? { reason, ...ctx.metadata } : ctx.metadata
        });
    }

    static logout(db: DB, userId: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'logout', { ...ctx, userId });
    }

    static signup(db: DB, userId: string, email: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'signup', { ...ctx, userId, email });
    }

    // ==================== Password Events ====================

    static passwordChange(db: DB, userId: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'password_change', { ...ctx, userId });
    }

    static passwordResetRequest(db: DB, email: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'password_reset_request', { ...ctx, email });
    }

    static passwordResetComplete(db: DB, userId: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'password_reset_complete', { ...ctx, userId });
    }

    // ==================== Session Events ====================

    static sessionRevoked(db: DB, userId: string, reason: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'session_revoked', {
            ...ctx,
            userId,
            metadata: { reason, ...ctx.metadata }
        });
    }

    static tokenRefresh(db: DB, userId: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'token_refresh', { ...ctx, userId });
    }

    // ==================== Security Events ====================

    static tokenReuseDetected(db: DB, userId: string, ctx: Partial<AuditContext> = {}, sessionId?: string): Promise<void> {
        return Audit.log(db, 'token_reuse_detected', {
            ...ctx,
            userId,
            metadata: sessionId ? { sessionId, ...ctx.metadata } : ctx.metadata
        });
    }

    static accountLocked(db: DB, email: string, ctx: Partial<AuditContext> = {}, lockedBy?: string): Promise<void> {
        return Audit.log(db, 'account_locked', {
            ...ctx,
            email,
            metadata: lockedBy ? { lockedBy, ...ctx.metadata } : ctx.metadata
        });
    }

    static accountUnlocked(db: DB, email: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'account_unlocked', { ...ctx, email });
    }

    // ==================== Static Helpers ====================

    /**
     * Extract audit context from Express request
     */
    static getContextFromRequest(req: {
        headers: Record<string, string | string[] | undefined>;
        socket?: { remoteAddress?: string };
        user?: { user_id?: string; email?: string };
    }): Partial<AuditContext> {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || undefined;

        const userAgent = req.headers['user-agent'] as string | undefined;

        return {
            ip,
            userAgent,
            userId: req.user?.user_id,
            email: req.user?.email,
        };
    }
}

export default Audit;
