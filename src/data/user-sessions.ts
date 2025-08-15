import DB from "@/services/db";

export const getActiveSession = (db: DB) => async (sid: string) => {
    const [activeSession] = await db.find('user_sessions', { sid })
    return activeSession
}