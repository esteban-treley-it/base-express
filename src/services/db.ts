import { db } from "@/config";
import { Pool, PoolClient, types as pgTypes } from "pg";
import { DeleteConditionArg, InsertTableSchema, SelectConditionArg, TableColumn, TableName, TableSchema, UpdateConditionArg, WhereConditionArg } from "@/types/db";
import { validateTableName } from "@/services/security";

/**
 * Database connection pool
 * Shared across all DB instances
 */
const POOL = new Pool({
    user: db.user,
    host: db.host,
    database: db.database,
    password: db.password,
    port: db.port,
    // Pool configuration
    max: 20,                    // Maximum connections in pool
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Fail if can't connect in 5s
});

// Log pool errors
POOL.on('error', (err) => {
    console.error('[DB POOL] Unexpected error on idle client:', err);
});

/**
 * Database class implementing Unit of Work pattern
 * 
 * Lifecycle:
 * 1. connect() - Acquires connection from pool and starts transaction
 * 2. ... perform database operations ...
 * 3. commit() - Commits transaction (on success)
 *    OR rollback() - Rolls back transaction (on error)
 * 4. release() - Returns connection to pool (always called)
 * 
 * Usage with handleRequest:
 * - Connection acquired automatically at request start
 * - Transaction started automatically
 * - Commit/rollback handled based on success/error
 * - Connection released in finally block
 */
export default class DB {
    private client: PoolClient | null = null;
    private inTransaction: boolean = false;
    private released: boolean = false;
    private static enumArrayParsersInit: Promise<void> | null = null;

    /**
     * Acquires a connection from the pool and starts a transaction
     * Must be called before any database operations
     */
    async connect(): Promise<void> {
        if (this.client) {
            throw new Error('Connection already acquired');
        }
        if (this.released) {
            throw new Error('DB instance already released, create a new one');
        }

        this.client = await POOL.connect();
        await DB.ensureEnumArrayParsers(this.client);
        await this.client.query('BEGIN');
        this.inTransaction = true;
    }

    /**
     * Commits the current transaction
     * Should be called on successful request completion
     */
    async commit(): Promise<void> {
        if (!this.client) {
            throw new Error('No active connection');
        }
        if (!this.inTransaction) {
            console.warn('[DB] No active transaction to commit');
            return;
        }

        await this.client.query('COMMIT');
        this.inTransaction = false;
    }

    /**
     * Rolls back the current transaction
     * Should be called on request error
     */
    async rollback(): Promise<void> {
        if (!this.client) {
            return; // No connection, nothing to rollback
        }
        if (!this.inTransaction) {
            return; // No transaction, nothing to rollback
        }

        try {
            await this.client.query('ROLLBACK');
        } catch (err) {
            console.error('[DB] Rollback failed:', err);
        }
        this.inTransaction = false;
    }

    /**
     * Releases the connection back to the pool
     * Must ALWAYS be called after request completes (in finally block)
     */
    release(): void {
        if (this.released) {
            return; // Already released
        }

        if (this.client) {
            if (this.inTransaction) {
                // Safety: if transaction still open, rollback before release
                console.warn('[DB] Connection released with open transaction, rolling back');
                this.client.query('ROLLBACK').catch(err => {
                    console.error('[DB] Emergency rollback failed:', err);
                });
            }
            this.client.release();
            this.client = null;
        }

        this.released = true;
        this.inTransaction = false;
    }

    /**
     * Checks if connection is active
     */
    isConnected(): boolean {
        return this.client !== null && !this.released;
    }

    /**
     * Gets the underlying client (for advanced use)
     * Throws if no connection
     */
    getClient(): PoolClient {
        if (!this.client) {
            throw new Error('No active connection. Call connect() first.');
        }
        return this.client;
    }

    /**
     * Helper to ensure connection exists before operation
     */
    private ensureConnected(): void {
        if (!this.client) {
            throw new Error('No active connection. Call connect() first.');
        }
        if (this.released) {
            throw new Error('Connection already released');
        }
    }

    private static async ensureEnumArrayParsers(client: PoolClient): Promise<void> {
        if (!DB.enumArrayParsersInit) {
            DB.enumArrayParsersInit = (async () => {
                const sql = `
                    SELECT t.typarray
                    FROM pg_type t
                    WHERE t.typtype = 'e' AND t.typarray <> 0;
                `;
                const result = await client.query(sql);
                const getTypeParserByOid = pgTypes.getTypeParser as unknown as (oid: number, format?: 'text' | 'binary') => any;
                const setTypeParserByOid = pgTypes.setTypeParser as unknown as (oid: number, parser: (value: string) => any) => void;
                const textArrayParser = getTypeParserByOid(1009, 'text');

                for (const row of result.rows) {
                    const arrayOid = Number(row.typarray);
                    if (Number.isFinite(arrayOid) && arrayOid > 0) {
                        setTypeParserByOid(arrayOid, textArrayParser);
                    }
                }
            })().catch((err) => {
                DB.enumArrayParsersInit = null;
                throw err;
            });
        }

        await DB.enumArrayParsersInit;
    }

    // ==================== Manual Transaction Control ====================
    // Use these for nested savepoints or manual transaction control

    /**
     * Starts a transaction manually (if not auto-started)
     */
    async beginTransaction(): Promise<void> {
        this.ensureConnected();
        if (this.inTransaction) {
            console.warn('[DB] Transaction already active');
            return;
        }
        await this.client!.query('BEGIN');
        this.inTransaction = true;
    }

    /**
     * Creates a savepoint for partial rollback
     */
    async savepoint(name: string): Promise<void> {
        this.ensureConnected();
        await this.client!.query(`SAVEPOINT ${name}`);
    }

    /**
     * Rolls back to a savepoint
     */
    async rollbackToSavepoint(name: string): Promise<void> {
        this.ensureConnected();
        await this.client!.query(`ROLLBACK TO SAVEPOINT ${name}`);
    }

    // ==================== Query Methods ====================

    /**
     * Executes a raw SQL query
     */
    async query<T = any>(sql: string, params?: any[]): Promise<T> {
        this.ensureConnected();
        const result = await this.client!.query(sql, params);
        return result.rows as T;
    }

    /**
     * Inserts one or more rows into a table
     */
    async insert<T extends TableName>(
        table: T,
        valuesArray: InsertTableSchema[T][],
        options: { returning: boolean } = { returning: true }
    ): Promise<TableSchema[T][]> {
        this.ensureConnected();

        // Security: Validate table name against whitelist
        validateTableName(table);

        if (valuesArray.length === 0) {
            throw new Error('Values array cannot be empty');
        }

        const insertFields = Object.keys(valuesArray[0]);
        const insertValues = valuesArray.flatMap(Object.values);

        const valuePlaceholders = valuesArray
            .map((_, rowIndex) =>
                `(${insertFields.map((_, colIndex) => `$${rowIndex * insertFields.length + colIndex + 1}`).join(',')})`
            )
            .join(', ');

        const sql = `
            INSERT INTO ${table} (${insertFields.join(',')})
            VALUES ${valuePlaceholders}
            ${options?.returning ? `RETURNING *` : ''};
        `;

        const result = await this.client!.query(sql, insertValues);
        return options?.returning ? result.rows : [];
    }

    /**
     * Inserts or updates a row based on conflict columns
     */
    async upsert<T extends TableName>(
        table: T,
        values: InsertTableSchema[T],
        conflictColumns: TableColumn<T>[],
        options: { returning?: boolean; updateColumns?: (TableColumn<T> | "*")[] } = { returning: true }
    ): Promise<TableSchema[T][]> {
        this.ensureConnected();

        // Security: Validate table name against whitelist
        validateTableName(table);

        if (!conflictColumns.length) {
            throw new Error('Conflict columns cannot be empty');
        }

        const insertFields = Object.keys(values);
        if (insertFields.length === 0) {
            throw new Error('Values object cannot be empty');
        }

        const insertValues = Object.values(values);
        const valuePlaceholders = insertFields.map((_, i) => `$${i + 1}`).join(', ');

        const updateColumns = options.updateColumns?.includes("*")
            ? insertFields
            : options.updateColumns ?? insertFields.filter(
                (field) => !conflictColumns.includes(field as TableColumn<T>)
            );

        const conflictTarget = conflictColumns.join(', ');
        const updateClause = updateColumns.length
            ? `DO UPDATE SET ${updateColumns.map((col) => `${col}=EXCLUDED.${col}`).join(', ')}`
            : 'DO NOTHING';

        const sql = `
            INSERT INTO ${table} (${insertFields.join(',')})
            VALUES (${valuePlaceholders})
            ON CONFLICT (${conflictTarget})
            ${updateClause}
            ${options?.returning ? 'RETURNING *' : ''};
        `;

        const result = await this.client!.query(sql, insertValues);
        return options?.returning ? result.rows : [];
    }

    private static createWhereStatement = (currentIndex: number, key: string, value: any) => {
        const IN = () => `${key} = ANY($${currentIndex})`
        const EQUALS = () => `${key}=$${currentIndex}`
        const CONTAINS = () => `${key} @> $${currentIndex}`
        const OVERLAPS = () => `${key} && $${currentIndex}`

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if ('$contains' in value) {
                const raw = (value as { $contains: any }).$contains;
                const arr = Array.isArray(raw) ? raw : [raw];
                return { clause: CONTAINS(), value: arr };
            }
            if ('$overlap' in value) {
                const raw = (value as { $overlap: any }).$overlap;
                const arr = Array.isArray(raw) ? raw : [raw];
                return { clause: OVERLAPS(), value: arr };
            }
            return { clause: EQUALS(), value };
        }

        if (Array.isArray(value)) {
            return { clause: IN(), value };
        }

        return { clause: EQUALS(), value };
    }

    private static getWhereClause = <T extends TableName>(
        where: WhereConditionArg<T>,
        startingIndex: number = 0
    ) => {
        let whereClause = 'WHERE ';
        const whereStrings: string[] = [];
        const values: any[] = [];

        for (const [key, value] of Object.entries(where)) {
            let clause: string = ''
            if (key.startsWith('$')) {
                if (key === '$gt' || key === '$lt' || key === '$ne') {
                    for (const [subKey, subValue] of Object.entries(value as SelectConditionArg<T>)) {
                        const operator = key === '$gt' ? '>' : key === '$lt' ? '<' : '<>';
                        clause = `${subKey} ${operator} $${values.length + 1}`;
                        values.push(subValue);
                    }
                }
            } else {
                const valueIndex = startingIndex + values.length + 1
                const statement = DB.createWhereStatement(valueIndex, key, value)
                clause = statement.clause
                values.push(statement.value);
            }
            whereStrings.push(clause);
        }
        whereClause += whereStrings.join(' AND ');
        return { where: whereClause, values };
    }

    /**
     * Finds rows matching the where clause
     */
    async find<T extends TableName>(
        table: T,
        where: WhereConditionArg<T>
    ): Promise<TableSchema[T][]> {
        this.ensureConnected();

        // Security: Validate table name against whitelist
        validateTableName(table);

        const { where: whereClause, values: whereValues } = DB.getWhereClause(where);
        const sql = `
            SELECT * FROM ${table}
            ${whereClause};
        `;

        const result = await this.client!.query(sql, whereValues);
        return result.rows;
    }

    /**
     * Deletes rows matching the where clause
     */
    async delete<T extends TableName>(
        table: T,
        where: DeleteConditionArg<T>,
        options: { returning?: boolean } = { returning: false }
    ): Promise<TableSchema[T][]> {
        this.ensureConnected();

        // Security: Validate table name against whitelist
        validateTableName(table);

        const conditionFields = Object.keys(where);
        const conditionValues = Object.values(where);

        const sql = `
            DELETE FROM ${table}
            WHERE ${conditionFields.map((field, i) => `${field}=$${i + 1}`).join(' AND ')}
            ${options.returning ? 'RETURNING *' : ''};
        `;

        const result = await this.client!.query(sql, conditionValues);
        return options.returning ? result.rows : [];
    }

    /**
     * Updates rows matching the where clause
     */
    async update<T extends TableName>(
        table: T,
        values: Partial<TableSchema[T]>,
        where: UpdateConditionArg<T>,
        options: { returning?: boolean } = { returning: true }
    ): Promise<TableSchema[T][]> {
        this.ensureConnected();

        // Security: Validate table name against whitelist
        validateTableName(table);

        const setFields = Object.keys(values);
        const setValues = Object.values(values);

        const { where: whereClause, values: whereValues } = DB.getWhereClause(where, setFields.length);

        const sql = `
            UPDATE ${table}
            SET ${setFields.map((field, i) => `${field}=$${i + 1}`).join(', ')}
            ${whereClause}
            ${options.returning ? 'RETURNING *' : ''};
        `;

        const result = await this.client!.query(sql, [...setValues, ...whereValues]);
        return options.returning ? result.rows : [];
    }

    /**
     * Pings the database to check connection
     * Note: This creates its own connection for health checks
     */
    static async ping(): Promise<boolean> {
        const client = await POOL.connect();
        try {
            await client.query('SELECT 1');
            return true;
        } finally {
            client.release();
        }
    }

    /**
     * Get pool statistics for monitoring
     */
    static getPoolStats() {
        return {
            totalCount: POOL.totalCount,
            idleCount: POOL.idleCount,
            waitingCount: POOL.waitingCount,
        };
    }

    /**
     * Graceful shutdown - close all pool connections
     */
    static async shutdown(): Promise<void> {
        await POOL.end();
    }
}
