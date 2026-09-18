// Applies sql/migrations/*.sql files in order, tracking applied filenames in a
// schema_migrations table. Forward-only: no rollback/down-migration support.
//
// Fresh databases are built from sql/index.sql + sql/indexes.sql. Migrations exist to bring an
// EXISTING database up to date, so every migration must be idempotent (IF NOT EXISTS / IF EXISTS,
// or DO $$ ... EXCEPTION WHEN duplicate_object): the first run against a database that already has
// the changes is expected to replay them harmlessly.
//
// Each file runs inside its own transaction, so a failing migration leaves nothing behind and stops
// the run. Statements that cannot run in a transaction (CREATE INDEX CONCURRENTLY, ALTER TYPE ...
// ADD VALUE on old Postgres versions) don't fit this runner.
//
// Convention: NNN_short_description.sql, applied in numeric order. Never edit an applied migration;
// add a new one.
//
// Usage: npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'sql', 'migrations');

// Same rule as src/config: only these NODE_ENV values may fall back to a default password.
const isDev = ['development', 'local', 'test'].includes(process.env.NODE_ENV || '');

const password = process.env.POSTGRES_PASSWORD || (isDev ? 'password' : '');
if (!password) {
    console.error('[migrate] POSTGRES_PASSWORD must be set when NODE_ENV is not development/local/test');
    process.exit(1);
}

const clientConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password,
    database: process.env.POSTGRES_DB || 'base-express',
    // Same reason as src/services/db.ts: timestamps must be evaluated in UTC
    options: '-c timezone=UTC',
};

// Arbitrary constant: serializes concurrent runs (two CI jobs, two containers) on one database
const LOCK_ID = 727274;

const leadingNumber = (filename) => {
    const match = filename.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

async function main() {
    const client = new Client(clientConfig);
    await client.connect();

    try {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);

        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename   TEXT PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        const { rows: appliedRows } = await client.query('SELECT filename FROM schema_migrations');
        const applied = new Set(appliedRows.map((row) => row.filename));

        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort((a, b) => leadingNumber(a) - leadingNumber(b) || a.localeCompare(b));

        const pending = files.filter((f) => !applied.has(f));

        if (pending.length === 0) {
            console.log('[migrate] nothing to apply');
            return;
        }

        for (const filename of pending) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
            try {
                await client.query('BEGIN');
                if (sql.trim().length > 0) {
                    await client.query(sql);
                }
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                console.log(`[migrate] applied ${filename}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[migrate] failed on ${filename}:`, err.message);
                process.exitCode = 1;
                return;
            }
        }

        console.log(`[migrate] applied ${pending.length} migration(s)`);
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('[migrate] unexpected error:', err);
    process.exitCode = 1;
});
