import { redis } from '@/config';
import Redis from 'ioredis';
import { ServiceUnavailable } from './errors';
import { logger } from './logger';

class RedisSingleton {
    private static instance: Redis;

    private constructor() { }

    public static getInstance(): Redis {
        if (!RedisSingleton.instance) {
            if (!redis.url) throw new ServiceUnavailable("Redis is unavailable.")
            RedisSingleton.instance = new Redis(redis.url);

            RedisSingleton.instance.on('error', (err) => {
                logger.error('redis', 'Connection error:', err);
            });

            RedisSingleton.instance.on('connect', () => {
                logger.info('redis', 'Connected to Redis');
            });
        }
        return RedisSingleton.instance;
    }

    public static async ping(): Promise<boolean> {
        try {
            if (!redis.url) return false;
            const redisClient = RedisSingleton.getInstance();
            await redisClient.ping();
            return true;
        } catch (error) {
            logger.error('redis', 'Ping failed:', error);
            return false
        }
    }
}

export default RedisSingleton;