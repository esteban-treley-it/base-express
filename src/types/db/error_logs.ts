export interface ErrorLogsDB {
    method: string
    route: string
    message: string,
    body: string
    headers: string
    user_data: string
    created_at: string
}

export type InsertErrorLogsDB = Omit<ErrorLogsDB, 'created_at'>;
