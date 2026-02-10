import { AppRequest } from "@/types/requests";
import { security, redis as redisConfig } from "@/config";
import RedisSingleton from "@/services/redis";
import fs from "fs";

type ServiceStatus = 'ok' | 'error';
type ConfigStatus = 'configured' | 'missing';

const checkDatabase = async (db: any): Promise<{ status: ServiceStatus; message?: string }> => {
    try {
        const query = await db.query("SELECT 1 AS health_check");
        return { status: query.length === 0 ? 'error' : 'ok' };
    } catch (error: any) {
        return { status: 'error', message: error.message };
    }
}

const checkRedis = async (): Promise<{ status: ServiceStatus; message?: string }> => {
    try {
        if (!redisConfig.url) {
            return { status: 'error', message: 'Redis URL not configured' };
        }
        const isConnected = await RedisSingleton.ping();
        return { status: isConnected ? 'ok' : 'error', message: isConnected ? undefined : 'Redis ping failed' };
    } catch (error: any) {
        return { status: 'error', message: error.message };
    }
}

const checkConfig = (): { [key: string]: { status: ConfigStatus; message?: string } } => {
    const config: { [key: string]: { status: ConfigStatus; message?: string } } = {};

    // JWT Private Key
    if (!security.jwtPrivateKeyPath) {
        config.jwtPrivateKey = { status: 'missing', message: 'JWT_SECRET_KEY_PATH not set' };
    } else {
        try {
            const keyExists = fs.existsSync(process.cwd() + security.jwtPrivateKeyPath);
            config.jwtPrivateKey = keyExists
                ? { status: 'configured' }
                : { status: 'missing', message: 'Private key file not found' };
        } catch {
            config.jwtPrivateKey = { status: 'missing', message: 'Cannot read private key file' };
        }
    }

    // Redis URL
    config.redisUrl = redisConfig.url
        ? { status: 'configured' }
        : { status: 'missing', message: 'REDIS_URL_AUTH not set' };

    return config;
}

export const healthCheck = async (req: AppRequest) => {
    const { db } = req;

    const [dbStatus, redisStatus] = await Promise.all([
        checkDatabase(db),
        checkRedis()
    ]);

    const configStatus = checkConfig();

    const allServicesOk = dbStatus.status === 'ok' && redisStatus.status === 'ok';
    const allConfigOk = Object.values(configStatus).every(c => c.status === 'configured');

    return {
        status: allServicesOk && allConfigOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        services: {
            database: dbStatus,
            redis: redisStatus
        },
        config: configStatus
    };
}