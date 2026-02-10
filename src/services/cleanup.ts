/**
 * Scheduled Cleanup Service
 * 
 * Runs periodic cleanup jobs to remove old data from the database.
 * Uses node-cron for scheduling (no PostgreSQL extensions required).
 * 
 * Retention periods:
 * - error_logs: 30 days
 * - audit_logs: 90 days
 * - user_sessions (revoked): 30 days
 * - user_sessions (expired): 7 days
 * - password_reset_tokens: used or expired
 */

import cron, { ScheduledTask } from 'node-cron';
import DB from './db';

// Retention configuration (in days)
const RETENTION = {
    errorLogs: 30,
    auditLogs: 90,
    revokedSessions: 30,
    expiredSessions: 7,
};

/**
 * Runs the cleanup queries
 * Can be called manually or by the scheduled job
 */
export async function runCleanup(): Promise<{
    errorLogs: number;
    auditLogs: number;
    revokedSessions: number;
    expiredSessions: number;
    passwordResetTokens: number;
}> {
    const db = new DB();
    
    try {
        await db.connect();

        // Delete old error logs
        const errorLogsResult = await db.query<{ count: string }[]>(`
            WITH deleted AS (
                DELETE FROM error_logs 
                WHERE created_at < NOW() - INTERVAL '${RETENTION.errorLogs} days'
                RETURNING 1
            )
            SELECT COUNT(*) as count FROM deleted
        `);
        const errorLogs = parseInt(errorLogsResult[0]?.count || '0');

        // Delete old audit logs
        const auditLogsResult = await db.query<{ count: string }[]>(`
            WITH deleted AS (
                DELETE FROM audit_logs 
                WHERE created_at < NOW() - INTERVAL '${RETENTION.auditLogs} days'
                RETURNING 1
            )
            SELECT COUNT(*) as count FROM deleted
        `);
        const auditLogs = parseInt(auditLogsResult[0]?.count || '0');

        // Delete old revoked sessions
        const revokedSessionsResult = await db.query<{ count: string }[]>(`
            WITH deleted AS (
                DELETE FROM user_sessions 
                WHERE status = 'revoked' 
                AND revoked_at < NOW() - INTERVAL '${RETENTION.revokedSessions} days'
                RETURNING 1
            )
            SELECT COUNT(*) as count FROM deleted
        `);
        const revokedSessions = parseInt(revokedSessionsResult[0]?.count || '0');

        // Delete old expired sessions
        const expiredSessionsResult = await db.query<{ count: string }[]>(`
            WITH deleted AS (
                DELETE FROM user_sessions 
                WHERE status = 'expired' 
                AND expires_at < NOW() - INTERVAL '${RETENTION.expiredSessions} days'
                RETURNING 1
            )
            SELECT COUNT(*) as count FROM deleted
        `);
        const expiredSessions = parseInt(expiredSessionsResult[0]?.count || '0');

        // Delete used or expired password reset tokens
        const tokensResult = await db.query<{ count: string }[]>(`
            WITH deleted AS (
                DELETE FROM password_reset_tokens 
                WHERE used_at IS NOT NULL 
                OR expires_at < NOW()
                RETURNING 1
            )
            SELECT COUNT(*) as count FROM deleted
        `);
        const passwordResetTokens = parseInt(tokensResult[0]?.count || '0');

        await db.commit();

        const stats = {
            errorLogs,
            auditLogs,
            revokedSessions,
            expiredSessions,
            passwordResetTokens,
        };

        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        if (total > 0) {
            console.log('[CLEANUP] Deleted records:', stats);
        }

        return stats;
    } catch (error) {
        await db.rollback();
        console.error('[CLEANUP] Failed:', error);
        throw error;
    } finally {
        db.release();
    }
}

/**
 * Starts the scheduled cleanup job
 * Default: runs daily at 3:00 AM
 */
export function startCleanupScheduler(schedule: string = '0 3 * * *'): ScheduledTask {
    console.log(`[CLEANUP] Scheduler started with schedule: ${schedule}`);

    const task = cron.schedule(schedule, async () => {
        console.log('[CLEANUP] Running scheduled cleanup...');
        try {
            await runCleanup();
        } catch (error) {
            // Error already logged in runCleanup
        }
    });

    return task;
}

/**
 * Stops the scheduled cleanup job
 */
export function stopCleanupScheduler(task: ScheduledTask): void {
    task.stop();
    console.log('[CLEANUP] Scheduler stopped');
}

export default {
    runCleanup,
    startCleanupScheduler,
    stopCleanupScheduler,
    RETENTION,
};
