# mileto-api

## Getting Started

### Docker
1. Make sure you have `docker` and `docker-compose` installed.
2. Run `docker network create postgres-network` to create postgres docker network.
3. Run `docker network create redis-network` to create redis docker network.
4. Run `docker compose -f docker-compose.services.yml up -d` to start Services (if not up).
5. Run `docker compose -f docker-compose.api.yml --env-file .env.docker up` (if .env.docker exists).

### NPM 
1. Create DB locally
2. npm install 
3. npm run dev
