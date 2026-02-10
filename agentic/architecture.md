# Architecture

## Overview

Express + TypeScript base project following a layered architecture with PostgreSQL and Redis.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (via `pg` pool)
- **Cache:** Redis (via `ioredis`)
- **Validation:** Zod
- **Auth:** JWT (RS256) + HTTP-only cookies + session management

## Layers

### Routes (`src/routes/`)
Defines HTTP routes and connects to controllers. Uses Express Router.

### Controllers (`src/controller/`)
Handle HTTP requests, input validation (via Zod schemas), and responses.

### Services (`src/services/`)
Contain business logic, authentication, database operations, caching.

### Data (`src/data/`)
Data access layer with raw SQL queries. Functions are curried with DB instance.

### Types (`src/types/`)
TypeScript type definitions organized by domain:
- `db/` - Database table schemas
- `controllers/` - Request body types
- `data/` - Data layer return types
- `services/` - Service-related types
- `requests/` - Extended Express Request types
- `auth.ts` - Token payload types

## Request Flow

```
Request → Route → Controller → Service → Data → Database
                                    ↓
Response ← Controller ← Service ←──┘
```

## Middlewares

Applied in order via `src/services/request.ts`:

1. **db** - Attaches DB instance to request
2. **schema** - Validates request body with Zod
3. **auth** - Validates tokens and attaches user to request

## Configuration

All config is centralized in `src/config/index.ts` using environment variables:

- `app` - Port, CORS, JWT key path, bcrypt rounds
- `db` - PostgreSQL connection settings
- `tokens` - Token expiry times and cookie names
- `redis` - Redis connection URL
