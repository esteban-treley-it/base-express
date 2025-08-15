import DB from "@/services/db";
import { UserTokenData } from "@/types/data/users";

export type UserDataWithPassword = UserTokenData & { password: string };

export const getUserByEmail = (db: DB) => async (email: string, withPassword: boolean = true): Promise<UserTokenData | UserDataWithPassword | null> => {
    const userData = await db!.query(`
        SELECT 
            u.id as user_id, 
            CONCAT(u.name, ' ', u.lastname) as name, 
            u.email, 
            u.is_owner, 
            u.password,
            o.id as org_id,
            o.name as org_name,
            o.key as org_key,
            ou.role as org_role
        FROM users u
        LEFT JOIN org_users ou ON u.id = ou.user_id
        LEFT JOIN orgs o ON ou.org_id = o.id
        WHERE u.email = $1 AND u.disabled = false;
    `, [email])

    if (userData.length === 0) {
        return null
    }
    const user = userData[0];

    if (!withPassword) return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        is_owner: user.is_owner,
        org: user.org_id ? {
            id: user.org_id,
            name: user.org_name,
            key: user.org_key,
            role: user.org_role
        } : {}
    } as UserTokenData
    return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        is_owner: user.is_owner,
        password: user.password,
        org: user.org_id ? {
            id: user.org_id,
            name: user.org_name,
            key: user.org_key,
            role: user.org_role
        } : {}
    } as UserDataWithPassword
}

