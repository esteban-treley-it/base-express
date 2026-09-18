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
import { logger } from '@/services/logger';

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
     * Core logging method - fails silently to not disrupt main flow.
     *
     * The insert runs inside a SAVEPOINT: if it fails (constraint, bad value...) Postgres would
     * otherwise mark the whole request transaction as aborted, and the request's COMMIT would
     * silently turn into a ROLLBACK. Callers must `await` these methods so the savepoint
     * statements can't interleave with the handler's own queries.
     */
    private static async log(db: DB, action: AuditAction, context: AuditContext): Promise<void> {
        const savepoint = 'audit_log';
        try {
            const entry: InsertAuditLogDB = {
                action,
                user_id: context.userId || null,
                email: context.email || null,
                ip_address: context.ip || null,
                user_agent: context.userAgent?.substring(0, 500) || null,
                metadata: context.metadata ? JSON.stringify(context.metadata) : null,
            };

            await db.savepoint(savepoint);
            await db.insert('audit_logs', [entry]);
            await db.releaseSavepoint(savepoint);
        } catch (error) {
            logger.error('audit', 'Failed to log event:', action, error);
            try {
                await db.rollbackToSavepoint(savepoint);
            } catch {
                // no usable transaction/connection - nothing to recover
            }
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

    // ==================== Identity Events ====================

    static emailVerified(db: DB, userId: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'email_verified', { ...ctx, userId });
    }

    static providerConnected(db: DB, userId: string, provider: string, ctx: Partial<AuditContext> = {}): Promise<void> {
        return Audit.log(db, 'provider_connected', {
            ...ctx,
            userId,
            metadata: { provider, ...ctx.metadata }
        });
    }

    // ==================== Static Helpers ====================

    /**
     * Extract audit context from Express request
     */
    static getContextFromRequest(req: {
        headers: Record<string, string | string[] | undefined>;
        ip?: string;
        user?: { user_id?: string; email?: string };
    }): Partial<AuditContext> {
        // req.ip honors the configured trust proxy hops; never read X-Forwarded-For directly
        const ip = req.ip || undefined;

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
