export type AuthProvider = 'password' | 'google';

export interface UserIdentityDB {
    id: string;
    user_id: string;
    provider: AuthProvider;
    provider_user_id: string;
    email: string | null;
    created_at: string;
    last_login_at: string | null;
}

export type InsertUserIdentityDB = Pick<UserIdentityDB, 'user_id' | 'provider' | 'provider_user_id' | 'email'>;
