export interface UserSessionDB {
    sid: string
    user_id: string
    access_token: string
    refresh_token: string
    created_at: string
    expires_at: string
}

export type InsertUserSessionDB = Omit<UserSessionDB, 'created_at'>;