# mileto-api

## Getting Started

### Docker
1. Make sure you have `docker` and `docker-compose` installed.
2. Run `mkdir keys && openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048`
3. To get a HMAC secret, run `npm run generate-hmac`. Copy the output and add it to the env file
4. Run `docker network create postgres-network` to create postgres docker network.
5. Run `docker network create redis-network` to create redis docker network.
6. Run `docker compose -f docker-compose.api.yml --env-file .env.docker up` (if .env.docker exists).
7. If SERVICES not UP, `docker compose -f docker-compose.services.yml --env-file .env.docker up -d` to start Services (if not up).

### NPM 
1. Create DB locally
2. npm install 
3. npm run dev
