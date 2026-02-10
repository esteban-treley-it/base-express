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
