export type UserRole = 'admin' | 'member';

export interface OrgUsersDB {
    id: string;
    org_id: string | null;
    user_id: string | null;
    role: UserRole;
    created_at: string;
}

export type InsertOrgUsersDB = Omit<OrgUsersDB, 'id' | 'created_at'>;
