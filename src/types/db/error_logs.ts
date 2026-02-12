export interface ErrorLogsDB {
    id: string;
    method: string;
    route: string;
    message: string;
    body: string | null;
    headers: string | null;
    user_data: string | null;
    created_at: string;
}

export type InsertErrorLogsDB = Omit<ErrorLogsDB, 'id' | 'created_at'>;
