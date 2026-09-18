# base-express-api

## Getting Started

### Docker
1. Make sure you have `docker` and `docker-compose` installed.
2. Run `npm run script:adapt <project-name>` to adapt Docker configuration to your project name.
3. Run `npm run script:keys` to generate RSA keys for JWT.
4. Run `npm run script:hmac` to get a HMAC secret. Copy the output and add it to `.env.docker`.
5. Run `docker network create postgres-network` to create postgres docker network.
6. Run `docker network create redis-network` to create redis docker network.
7. Run `npm run docker:services` to start PostgreSQL and Redis services.
8. Run `npm run docker:dev` to start the API server.

### NPM 
1. Create DB locally
2. npm install 
3. npm run dev

## Database migrations

Fresh databases are built from `sql/index.sql` + `sql/indexes.sql`. To bring an **existing** database up to date, add numbered files to `sql/migrations/` (`NNN_description.sql`, idempotent, never edited once applied) and run:

```bash
npm run migrate
```

It applies pending files in order, one transaction each, and records them in `schema_migrations`. It is forward-only (no rollback) and reads the same `POSTGRES_*` variables as the app. Run it against the right database: it loads `.env` from the current directory.

