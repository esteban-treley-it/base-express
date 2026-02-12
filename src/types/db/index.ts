import { UserDB, InsertUserDB } from "./users";
import { UserSessionDB, InsertUserSessionDB } from "./user_sessions";
import { ErrorLogsDB, InsertErrorLogsDB } from "./error_logs";
import { AuditLogDB, InsertAuditLogDB } from "./audit_logs";
import { PasswordResetTokenDB, InsertPasswordResetTokenDB } from "./password_reset_tokens";

export interface TableSchema {
    users: UserDB;
    user_sessions: UserSessionDB;
    error_logs: ErrorLogsDB;
    audit_logs: AuditLogDB;
    password_reset_tokens: PasswordResetTokenDB;
}

export type InsertTableSchema = {
    users: InsertUserDB;
    user_sessions: InsertUserSessionDB;
    error_logs: InsertErrorLogsDB;
    audit_logs: InsertAuditLogDB;
    password_reset_tokens: InsertPasswordResetTokenDB;
}

export type TableName = keyof TableSchema;
export type TableColumn<T extends TableName> = Extract<keyof TableSchema[T], string>;

type ArraySearchCondition = { $contains: any | any[] } | { $overlap: any | any[] };

export type SelectConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any | ArraySearchCondition>>;

export type WhereConditionArg<T extends TableName> = SelectConditionArg<T> & {
    $or?: SelectConditionArg<T>[];
    $and?: SelectConditionArg<T>[];
    $gt?: SelectConditionArg<T>;
    $lt?: SelectConditionArg<T>;
    $ne?: SelectConditionArg<T>;
}

export type UpdateConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;
export type DeleteConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;
