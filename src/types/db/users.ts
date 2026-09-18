export interface UserDB {
    id: string;
    name: string | null;
    lastname: string | null;
    phone: string | null;
    email: string | null;
    password: string | null;
    disabled: boolean;
    created_at: string;
    updated_at: string;
    email_verified_at: string | null;
    email_verification_token: string | null;
    email_verification_sent_at: string | null;
}

export type InsertUserDB = Omit<UserDB, 'id' | 'created_at' | 'updated_at' | 'email_verified_at' | 'email_verification_token' | 'email_verification_sent_at'>;
