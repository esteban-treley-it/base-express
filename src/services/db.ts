import { db } from "@/config";
import { Pool, PoolClient } from "pg";
import { DeleteConditionArg, InsertTableSchema, SelectConditionArg, TableName, TableSchema, UpdateConditionArg, WhereConditionArg } from "@/types/db";

const POOL = new Pool({
    user: db.user,
    host: db.host,
    database: db.database,
    password: db.password,
    port: db.port,
});

export default class DB {
    private cxn: PoolClient | undefined;
    hasTransaction: boolean = false;

    setConnection = async <T>(fn: () => Promise<T>): Promise<T> => {
        try {
            if (!this.cxn) {
                this.cxn = await POOL.connect();
            }
            return await fn.call(this);
        } catch (error) {
            console.error('Database operation failed:', error);
            if (this.cxn && this.hasTransaction) {
                console.log('SET CONNECTION ERROR ROLLBACK ON CATCH')
                await this.cxn.query('ROLLBACK;');
                this.hasTransaction = false;
            }
            throw error;
        } finally {
            if (this.cxn && !this.hasTransaction) {
                this.cxn.release();
                this.cxn = undefined;
            }
        }
    };

    getClient = (): PoolClient => {
        if (!this.cxn) throw new Error("Connection not established");
        return this.cxn;
    }

    beginTransaction = async () => await this.setConnection(async () => {
        await this.cxn!.query('BEGIN;');
        this.hasTransaction = true;
    })

    commit = async () => await this.setConnection(async () => {
        if (!this.hasTransaction) {
            console.warn('No active transaction to rollback');
            return;
        }
        await this.cxn!.query('COMMIT;');
        this.hasTransaction = false;
    })

    rollback = async () => await this.setConnection(async () => {
        if (!this.hasTransaction) {
            console.warn('No active transaction to rollback');
            return;
        }
        await this.cxn!.query('ROLLBACK;');
        this.hasTransaction = false;
    })

    query = async <T = any>(query: string, params?: any[]): Promise<T> => await this.setConnection(async () => {
        const result = await this.cxn!.query(query, params);
        return result.rows as T;
    })

    insert = async<T extends TableName>(
        table: T,
        valuesArray: InsertTableSchema[T][],
        options: { returning: boolean } = { returning: true }
    ): Promise<TableSchema[T][]> => await this.setConnection(async () => {
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

        const query = `
            INSERT INTO ${table} (${insertFields.join(',')})
            VALUES ${valuePlaceholders}
            ${options?.returning ? `RETURNING *` : ''};
        `;

        const result = await this.cxn!.query(query, insertValues);
        return options?.returning ? result.rows : [];
    })

    private static createWhereStatement = (currentIndex: number, key: string, value: any) => {
        const IN = () => `${key} = ANY($${currentIndex})`

        const EQUALS = () => `${key}=$${currentIndex}`

        if (Array.isArray(value)) {
            return IN()
        }
        return EQUALS()
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
                if (key === '$gt' || key === '$lt') {
                    for (const [subKey, subValue] of Object.entries(value as SelectConditionArg<T>)) {
                        clause = `${subKey} ${key === '$gt' ? '>' : '<'} $${values.length + 1}`;
                        values.push(subValue);
                    }
                }
            } else {
                const valueIndex = startingIndex + values.length + 1
                clause = DB.createWhereStatement(valueIndex, key, value)
                values.push(value);
            }
            whereStrings.push(clause);
        }
        whereClause += whereStrings.join(' AND ');
        return { where: whereClause, values };
    }

    find = async <T extends TableName>(
        table: T,
        where: WhereConditionArg<T>
    ): Promise<TableSchema[T][]> => await this.setConnection(async () => {

        const { where: whereClause, values: whereValues } = DB.getWhereClause(where)
        const query = `
                SELECT * FROM ${table}
                ${whereClause};
            `

        const result = await this.cxn!.query(query, whereValues)
        return result.rows
    })

    delete = async <T extends TableName>(
        table: T,
        where: DeleteConditionArg<T>,
        options: { returning?: boolean } = { returning: false }
    ): Promise<TableSchema[T][]> => await this.setConnection(async () => {
        const conditionFields = Object.keys(where)
        const conditionValues = Object.values(where)

        const query = `
                DELETE FROM ${table}
                WHERE ${conditionFields.map((field, i) => `${field}=$${i + 1}`).join(' AND ')}
                ${options.returning ? 'RETURNING *' : ''};
            `

        const result = await this.cxn!.query(query, conditionValues)
        return options.returning ? result.rows : [];
    })

    update = async <T extends TableName>(
        table: T,
        values: Partial<TableSchema[T]>,
        where: UpdateConditionArg<T>,
        options: { returning?: boolean } = { returning: true }
    ): Promise<TableSchema[T][]> => await this.setConnection(async () => {
        const setFields = Object.keys(values);
        const setValues = Object.values(values);

        const { where: whereClause, values: whereValues } = DB.getWhereClause(where, setFields.length)

        const query = `
            UPDATE ${table}
            SET ${setFields.map((field, i) => `${field}=$${i + 1}`).join(', ')}
            ${whereClause}
            ${options.returning ? 'RETURNING *' : ''};
        `;

        const result = await this.cxn!.query(query, [...setValues, ...whereValues]);
        return options.returning ? result.rows : [];
    });

    ping = async () => {
        return await this.setConnection(async () => {
            await this.cxn!.query('SELECT 1');
            return true;
        });
    };
}
