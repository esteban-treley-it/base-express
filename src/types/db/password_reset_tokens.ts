/**
 * Password Reset Token Types
 */

export interface PasswordResetTokenDB {
    id: string;
    user_id: string;
    token_hash: string;           // SHA-256 hash of the token
    expires_at: string;
    used_at: string | null;       // Set when token is used
    created_at: string;
}

export type InsertPasswordResetTokenDB = Omit<PasswordResetTokenDB, 'id' | 'created_at' | 'used_at'>;
