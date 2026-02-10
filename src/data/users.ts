import DB from "@/services/db";
import { UserTokenData } from "@/types/data/users";
import { auth as authConfig } from "@/config";

export type UserDataWithPassword = UserTokenData & { password: string };

/**
 * Gets user by email
 */
export const getUserByEmail = (db: DB) => async (email: string, withPassword: boolean = true): Promise<UserTokenData | UserDataWithPassword | null> => {
    // Build query based on multi-tenant mode
    const baseSelect = `
        SELECT 
            u.id as user_id, 
            CONCAT(u.name, ' ', u.lastname) as name, 
            u.email, 
            u.password`;

    const orgSelect = authConfig.multiTenant ? `,
            o.id as org_id,
            o.name as org_name,
            o.key as org_key,
            ou.role as org_role` : '';

    const orgJoin = authConfig.multiTenant ? `
        LEFT JOIN org_users ou ON u.id = ou.user_id
        LEFT JOIN orgs o ON ou.org_id = o.id` : '';

    const query = `${baseSelect}${orgSelect}
        FROM users u${orgJoin}
        WHERE u.email = $1 AND u.disabled = false;`;

    const userData = await db!.query(query, [email]);

    if (userData.length === 0) {
        return null;
    }
    const user = userData[0];

    const org = authConfig.multiTenant && user.org_id ? {
        id: user.org_id,
        name: user.org_name,
        key: user.org_key,
        role: user.org_role
    } : undefined;

    if (!withPassword) return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        ...(org && { org })
    } as UserTokenData;

    return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        password: user.password,
        ...(org && { org })
    } as UserDataWithPassword;
}

/**
 * Gets user by ID
 */
export const getUserById = (db: DB) => async (userId: string): Promise<UserTokenData | null> => {
    // Build query based on multi-tenant mode
    const baseSelect = `
        SELECT 
            u.id as user_id, 
            CONCAT(u.name, ' ', u.lastname) as name, 
            u.email`;

    const orgSelect = authConfig.multiTenant ? `,
            o.id as org_id,
            o.name as org_name,
            o.key as org_key,
            ou.role as org_role` : '';

    const orgJoin = authConfig.multiTenant ? `
        LEFT JOIN org_users ou ON u.id = ou.user_id
        LEFT JOIN orgs o ON ou.org_id = o.id` : '';

    const query = `${baseSelect}${orgSelect}
        FROM users u${orgJoin}
        WHERE u.id = $1 AND u.disabled = false;`;

    const userData = await db!.query(query, [userId]);

    if (userData.length === 0) {
        return null;
    }

    const user = userData[0];
    const org = authConfig.multiTenant && user.org_id ? {
        id: user.org_id,
        name: user.org_name,
        key: user.org_key,
        role: user.org_role
    } : undefined;

    return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        ...(org && { org })
    } as UserTokenData;
};

