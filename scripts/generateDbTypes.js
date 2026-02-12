const fs = require('fs');
const path = require('path');

const SQL_DIR = path.join(__dirname, '..', 'sql');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'types', 'db');

const TABLE_TYPE_NAME = {
    users: 'UserDB',
    user_sessions: 'UserSessionDB',
    error_logs: 'ErrorLogsDB',
    audit_logs: 'AuditLogDB',
    password_reset_tokens: 'PasswordResetTokenDB',
    user_profile: 'UserProfileDB',
    templates: 'TemplateDB',
    portafolios: 'PortafolioDB',
};

const INSERT_PICK = {
    user_sessions: ['sid', 'user_id', 'refresh_jti', 'expires_at'],
};

const INSERT_OMIT_EXTRA = {
    password_reset_tokens: ['used_at'],
};

const EXTRA_TYPES_BY_TABLE = {
    user_sessions: "export type RevokeReason = 'logout' | 'token_reuse' | 'admin_action' | 'password_change';",
};

const DEFAULT_OMIT = ['id', 'created_at', 'updated_at'];

const TABLE_ORDER = [
    'users',
    'user_sessions',
    'error_logs',
    'audit_logs',
    'password_reset_tokens',
    'user_profile',
    'templates',
    'portafolios',
];

const ENUM_TYPE_NAME_OVERRIDES = {};

const isSqlFile = (file) => file.endsWith('.sql');

const toPascalCase = (value) => {
    return value
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
};

const getEnumTypeName = (enumName) => {
    return ENUM_TYPE_NAME_OVERRIDES[enumName] || toPascalCase(enumName);
};

const readSqlFiles = () => {
    const files = fs.readdirSync(SQL_DIR).filter(isSqlFile);
    return files.map((file) => fs.readFileSync(path.join(SQL_DIR, file), 'utf8')).join('\n');
};

const stripComments = (sql) => {
    const withoutLineComments = sql.replace(/--.*$/gm, '');
    return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
};

const parseEnums = (sql) => {
    const enums = new Map();
    const enumRegex = /create\s+type\s+(\w+)\s+as\s+enum\s*\(([^)]*?)\)\s*;?/gi;
    let match;
    while ((match = enumRegex.exec(sql)) !== null) {
        const name = match[1].toLowerCase();
        const valuesBlock = match[2];
        const values = [];
        const valueRegex = /'([^']+)'/g;
        let valueMatch;
        while ((valueMatch = valueRegex.exec(valuesBlock)) !== null) {
            values.push(valueMatch[1]);
        }
        if (values.length > 0) {
            enums.set(name, values);
        }
    }
    return enums;
};

const splitTopLevelCommas = (text) => {
    const parts = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;

        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        parts.push(current);
    }

    return parts;
};

const parseTables = (sql) => {
    const tables = [];
    const tableRegex = /create\s+table\s+(\w+)\s*\(([^;]*?)\)\s*;/gi;
    let match;
    while ((match = tableRegex.exec(sql)) !== null) {
        const name = match[1];
        const body = match[2];
        const columns = parseColumns(body);
        tables.push({ name, columns });
    }
    return tables;
};

const parseColumns = (body) => {
    const parts = splitTopLevelCommas(body);
    const columns = [];

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lower = trimmed.toLowerCase();
        if (
            lower.startsWith('constraint') ||
            lower.startsWith('unique') ||
            lower.startsWith('primary') ||
            lower.startsWith('foreign') ||
            lower.startsWith('check')
        ) {
            continue;
        }

        const match = trimmed.match(/^"?([a-zA-Z_][\w]*)"?\s+(.+)$/);
        if (!match) continue;

        const name = match[1];
        const rest = match[2];
        const typeMatch = rest.match(/^([a-zA-Z_][\w]*)(\s*\([^)]*\))?/);
        if (!typeMatch) continue;

        const typeName = typeMatch[1].toLowerCase();
        const hasNotNull = /not\s+null/i.test(rest);
        const hasPrimaryKey = /primary\s+key/i.test(rest);
        const hasDefault = /default\s+/i.test(rest);
        const nullable = !(hasNotNull || hasPrimaryKey || hasDefault);

        columns.push({ name, typeName, nullable });
    }

    return columns;
};

const mapTypeToTs = (typeName, enums) => {
    if (enums.has(typeName)) {
        return getEnumTypeName(typeName);
    }

    switch (typeName) {
        case 'uuid':
        case 'varchar':
        case 'text':
        case 'timestamp':
        case 'timestamptz':
        case 'date':
        case 'time':
        case 'jsonb':
        case 'json':
            return 'string';
        case 'boolean':
            return 'boolean';
        case 'integer':
        case 'int':
        case 'int2':
        case 'int4':
        case 'int8':
        case 'smallint':
        case 'bigint':
        case 'numeric':
        case 'decimal':
            return 'number';
        default:
            console.warn(`[generateDbTypes] Unknown SQL type: ${typeName}`);
            return 'any';
    }
};

const formatUnionType = (name, values) => {
    const literals = values.map((value) => `'${value}'`);
    if (literals.length <= 4) {
        return `export type ${name} = ${literals.join(' | ')};`;
    }
    return `export type ${name} =\n${literals.map((value) => `    | ${value}`).join('\n')};`;
};

const generateTableFile = (table, enums) => {
    const tableName = table.name;
    const interfaceName = TABLE_TYPE_NAME[tableName] || `${toPascalCase(tableName)}DB`;
    const insertTypeName = `Insert${interfaceName}`;

    const enumNames = new Set();
    for (const column of table.columns) {
        if (enums.has(column.typeName)) {
            enumNames.add(column.typeName);
        }
    }

    const lines = [];

    for (const enumName of enumNames) {
        const enumTypeName = getEnumTypeName(enumName);
        const values = enums.get(enumName) || [];
        lines.push(formatUnionType(enumTypeName, values));
        lines.push('');
    }

    lines.push(`export interface ${interfaceName} {`);
    for (const column of table.columns) {
        const tsType = mapTypeToTs(column.typeName, enums);
        const typeWithNull = column.nullable ? `${tsType} | null` : tsType;
        lines.push(`    ${column.name}: ${typeWithNull};`);
    }
    lines.push('}');
    lines.push('');

    if (INSERT_PICK[tableName]) {
        const picks = INSERT_PICK[tableName]
            .filter((name) => table.columns.some((col) => col.name === name))
            .map((name) => `'${name}'`)
            .join(' | ');
        lines.push(`export type ${insertTypeName} = Pick<${interfaceName}, ${picks}>;`);
    } else {
        const omits = new Set(
            DEFAULT_OMIT
                .filter((name) => table.columns.some((col) => col.name === name))
                .concat(INSERT_OMIT_EXTRA[tableName] || [])
        );
        if (omits.size > 0) {
            const omitList = Array.from(omits)
                .map((name) => `'${name}'`)
                .join(' | ');
            lines.push(`export type ${insertTypeName} = Omit<${interfaceName}, ${omitList}>;`);
        } else {
            lines.push(`export type ${insertTypeName} = ${interfaceName};`);
        }
    }

    if (EXTRA_TYPES_BY_TABLE[tableName]) {
        lines.push('');
        lines.push(EXTRA_TYPES_BY_TABLE[tableName]);
    }

    return lines.join('\n');
};

const generateIndexFile = (tables) => {
    const lines = [];

    for (const table of tables) {
        const interfaceName = TABLE_TYPE_NAME[table.name] || `${toPascalCase(table.name)}DB`;
        const insertTypeName = `Insert${interfaceName}`;
        lines.push(`import { ${interfaceName}, ${insertTypeName} } from "./${table.name}";`);
    }

    lines.push('');
    lines.push('export interface TableSchema {');
    for (const table of tables) {
        const interfaceName = TABLE_TYPE_NAME[table.name] || `${toPascalCase(table.name)}DB`;
        lines.push(`    ${table.name}: ${interfaceName};`);
    }
    lines.push('}');
    lines.push('');
    lines.push('export type InsertTableSchema = {');
    for (const table of tables) {
        const insertTypeName = `Insert${TABLE_TYPE_NAME[table.name] || `${toPascalCase(table.name)}DB`}`;
        lines.push(`    ${table.name}: ${insertTypeName};`);
    }
    lines.push('}');
    lines.push('');
    lines.push('export type TableName = keyof TableSchema;');
    lines.push('export type TableColumn<T extends TableName> = keyof TableSchema[T];');
    lines.push('');
    lines.push('export type SelectConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;');
    lines.push('');
    lines.push('export type WhereConditionArg<T extends TableName> = SelectConditionArg<T> & {');
    lines.push('    $or?: SelectConditionArg<T>[];');
    lines.push('    $and?: SelectConditionArg<T>[];');
    lines.push('    $gt?: SelectConditionArg<T>;');
    lines.push('    $lt?: SelectConditionArg<T>;');
    lines.push('}');
    lines.push('');
    lines.push('export type UpdateConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;');
    lines.push('export type DeleteConditionArg<T extends TableName> = Partial<Record<TableColumn<T>, any>>;');

    return lines.join('\n');
};

const main = () => {
    const sql = stripComments(readSqlFiles());
    const enums = parseEnums(sql);
    const tables = parseTables(sql);

    const tableMap = new Map(tables.map((table) => [table.name, table]));
    const orderedTables = [];

    for (const name of TABLE_ORDER) {
        if (tableMap.has(name)) {
            orderedTables.push(tableMap.get(name));
            tableMap.delete(name);
        }
    }

    for (const [_, table] of tableMap) {
        orderedTables.push(table);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (const table of orderedTables) {
        const content = generateTableFile(table, enums);
        fs.writeFileSync(path.join(OUTPUT_DIR, `${table.name}.ts`), `${content}\n`, 'utf8');
    }

    const indexContent = generateIndexFile(orderedTables);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), `${indexContent}\n`, 'utf8');

    console.log(`[generateDbTypes] Generated ${orderedTables.length} table type files.`);
};

main();
