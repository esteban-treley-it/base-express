export interface UserDB {
    id: string;
    name: string;
    lastname: string;
    phone: string
    email: string;
    password: string;
    disabled: boolean;
    created_at: string;
    updated_at: string;
}

export type InsertUserDB = Omit<UserDB, 'id' | 'created_at' | 'updated_at'>;