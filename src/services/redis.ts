import { redis } from '@/config';
import Redis from 'ioredis';
import { ServiceUnavailable } from './errors';

class RedisSingleton {
    private static instance: Redis;

    private constructor() { }

    public static getInstance(): Redis {
        if (!RedisSingleton.instance) {
            if (!redis.url) throw new ServiceUnavailable("Redis is unavailable.")
            RedisSingleton.instance = new Redis(redis.url);

            RedisSingleton.instance.on('error', (err) => {
                console.error('Redis connection error:', err);
            });

            RedisSingleton.instance.on('connect', () => {
                console.log('Connected to Redis');
            });
        }
        return RedisSingleton.instance;
    }

    public static async ping(): Promise<boolean> {
        const redis = RedisSingleton.instance;
        try {
            await redis.ping();
            return true;
        } catch (error) {
            console.error("Redis ping failed:", error);
            return false
        }
    }
}

export default RedisSingleton;