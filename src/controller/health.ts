import { AppRequest } from "@/types/requests";
import { app, db as dbConfig } from "@/config";

const dbCheck = async (db: any) => {
    let status = 'ok';
    try {
        const query = await db.query("SELECT 1 AS health_check");
        status = query.length === 0 ? 'Database connection is not available' : 'ok';
    } catch (error: any) {
        status = error.message;
    }

    return {
        config: {
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user
        },
        status
    }
}

export const healthCheck = async (req: AppRequest) => {
    const { db } = req;

    const statuses: Record<string, any> = {}
    const dbStatus = await dbCheck(db);

    statuses["postgres"] = dbStatus;
    statuses["api"] = app
    return statuses;
}