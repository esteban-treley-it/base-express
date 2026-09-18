export interface OrgsDB {
    id: string;
    name: string;
    key: string;
    disabled: boolean;
    created_at: string;
    updated_at: string;
}

export type InsertOrgsDB = Omit<OrgsDB, 'id' | 'created_at' | 'updated_at'>;
