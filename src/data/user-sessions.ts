import DB from "@/services/db";
import { UserSessionDB, RevokeReason } from "@/types/db/user_sessions";
import { hashJti } from "@/services/security";

/**
 * Gets an active session by SID
 */
export const getActiveSession = (db: DB) => async (sid: string): Promise<UserSessionDB | null> => {
    const [session] = await db.query<UserSessionDB[]>(`
        SELECT * FROM user_sessions 
        WHERE sid = $1 AND status = 'active' AND expires_at > NOW()
    `, [sid]);
    return session || null;
};

/**
 * Gets a session by refresh token JTI (for rotation validation)
 * JTI is stored as SHA-256 hash for security
 */
export const getSessionByRefreshJti = (db: DB) => async (jti: string): Promise<UserSessionDB | null> => {
    const jtiHash = hashJti(jti);
    const [session] = await db.query<UserSessionDB[]>(`
        SELECT * FROM user_sessions 
        WHERE refresh_jti = $1 AND status = 'active'
    `, [jtiHash]);
    return session || null;
};

/**
 * Creates a new session
 * JTI is stored as SHA-256 hash for security
 */
export const createSession = (db: DB) => async (
    sid: string,
    userId: string,
    refreshJti: string,
    expiresAt: string
): Promise<UserSessionDB> => {
    const jtiHash = hashJti(refreshJti);
    const [session] = await db.query<UserSessionDB[]>(`
        INSERT INTO user_sessions (sid, user_id, refresh_jti, status, expires_at, last_seen_at)
        VALUES ($1, $2, $3, 'active', $4, NOW())
        RETURNING *
    `, [sid, userId, jtiHash, expiresAt]);
    return session;
};

/**
 * Updates the refresh token JTI (for token rotation)
 * JTI is stored as SHA-256 hash for security
 */
export const rotateRefreshToken = (db: DB) => async (
    sid: string,
    newJti: string
): Promise<UserSessionDB | null> => {
    const jtiHash = hashJti(newJti);
    const [session] = await db.query<UserSessionDB[]>(`
        UPDATE user_sessions
        SET refresh_jti = $2, rotated_at = NOW(), last_seen_at = NOW()
        WHERE sid = $1 AND status = 'active'
        RETURNING *
    `, [sid, jtiHash]);
    return session || null;
};

/**
 * Updates last_seen_at timestamp
 */
export const updateSessionLastSeen = (db: DB) => async (sid: string): Promise<void> => {
    await db.query(`
        UPDATE user_sessions
        SET last_seen_at = NOW()
        WHERE sid = $1 AND status = 'active'
    `, [sid]);
};

/**
 * Revokes a session with a reason
 */
export const revokeSession = (db: DB) => async (
    sid: string,
    reason: RevokeReason
): Promise<void> => {
    await db.query(`
        UPDATE user_sessions
        SET status = 'revoked', revoked_at = NOW(), revoke_reason = $2
        WHERE sid = $1
    `, [sid, reason]);
};

/**
 * Revokes all sessions for a user (except optionally one)
 */
export const revokeAllUserSessions = (db: DB) => async (
    userId: string,
    reason: RevokeReason,
    exceptSid?: string
): Promise<number> => {
    const result = await db.query<{ count: string }[]>(`
        WITH updated AS (
            UPDATE user_sessions
            SET status = 'revoked', revoked_at = NOW(), revoke_reason = $2
            WHERE user_id = $1 AND status = 'active' ${exceptSid ? 'AND sid != $3' : ''}
            RETURNING 1
        )
        SELECT COUNT(*) as count FROM updated
    `, exceptSid ? [userId, reason, exceptSid] : [userId, reason]);
    return parseInt(result[0]?.count || '0');
};

/**
 * Checks if a refresh JTI has already been used (reuse detection)
 * Returns the session if found in revoked state (indicates reuse attack)
 */
export const checkRefreshTokenReuse = (db: DB) => async (jti: string): Promise<UserSessionDB | null> => {
    // Look for any session that HAD this JTI but was rotated (jti changed) or revoked
    const [session] = await db.query<UserSessionDB[]>(`
        SELECT * FROM user_sessions 
        WHERE refresh_jti != $1 
        AND sid IN (
            SELECT sid FROM user_sessions WHERE refresh_jti = $1
        )
        LIMIT 1
    `, [jti]);
    return session || null;
};

/**
 * Deletes a session (hard delete - use revokeSession for audit trail)
 * @deprecated Use revokeSession instead
 */
export const invalidateSession = (db: DB) => async (sid: string): Promise<void> => {
    await revokeSession(db)(sid, 'logout');
};

/**
 * Cleans up expired sessions
 */
export const cleanupExpiredSessions = (db: DB) => async (): Promise<number> => {
    const result = await db.query<{ count: string }[]>(`
        WITH updated AS (
            UPDATE user_sessions
            SET status = 'expired'
            WHERE status = 'active' AND expires_at < NOW()
            RETURNING 1
        )
        SELECT COUNT(*) as count FROM updated
    `, []);
    return parseInt(result[0]?.count || '0');
};