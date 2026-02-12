export interface PasswordResetTokenDB {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    used_at: string | null;
    created_at: string;
}

export type InsertPasswordResetTokenDB = Omit<PasswordResetTokenDB, 'id' | 'created_at' | 'used_at'>;
