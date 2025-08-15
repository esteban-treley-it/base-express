import dotenv from 'dotenv';

dotenv.config()

export const app = {
    port: process.env.PORT || 8000,
    cors: {
        origin: process.env.REACT_APP_URL || 'http://localhost:8000',
        credentials: true,
    },
    host: process.env.HOST || 'localhost',
    saltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    jwtPrivateKeyPath: process.env.JWT_SECRET_KEY_PATH || '',
    hmacSecret: process.env.HMAC_SECRET || ''
}


export const db = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'mileto',
}

export const tokens = {
    expiry: {
        access: 2 * 60 * 1000,
        refresh: 7 * 24 * 60 * 60 * 1000,
        id: 15 * 60 * 1000,
    },
    names: {
        access: 'x-access-token',
        refresh: 'x-refresh-token',
        id: 'x-id-token',
        sid: 'x-sid'
    }
}

export const redis = {
    url: process.env.REDIS_URL_AUTH || ''
}