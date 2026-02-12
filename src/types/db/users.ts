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
}

export type InsertUserDB = Omit<UserDB, 'id' | 'created_at' | 'updated_at'>;
