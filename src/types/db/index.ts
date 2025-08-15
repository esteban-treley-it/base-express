import { UserDB, InsertUserDB } from "./users";
import { UserSessionDB, InsertUserSessionDB } from "./user_sessions";
import { ErrorLogsDB, InsertErrorLogsDB } from "./error_logs";

export interface TableSchema {
    users: UserDB;
    user_sessions: UserSessionDB;
    error_logs: ErrorLogsDB
}

export type InsertTableSchema = {
    users: InsertUserDB;
    user_sessions: InsertUserSessionDB;
    error_logs: InsertErrorLogsDB
}

export type TableName = keyof TableSchema;
export type TableColumn<T extends TableName> = keyof TableSchema[T];

export type SelectConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;

export type WhereConditionArg<T extends TableName> = SelectConditionArg<T> & {
    $or?: SelectConditionArg<T>[];
    $and?: SelectConditionArg<T>[];
    $gt?: SelectConditionArg<T>;
    $lt?: SelectConditionArg<T>;
}

export type UpdateConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;
export type DeleteConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;