import DB from "@/services/db";
import { AuthProvider, UserIdentityDB } from "@/types/db/user_identities";

/**
 * Finds a linked identity by provider + provider-side subject id.
 */
export const getIdentityByProviderId = (db: DB) => async (
    provider: AuthProvider,
    providerUserId: string
): Promise<{ id: string; user_id: string } | null> => {
    const [row] = await db.query<{ id: string; user_id: string }[]>(
        `SELECT id, user_id FROM user_identities WHERE provider = $1 AND provider_user_id = $2`,
        [provider, providerUserId]
    );
    return row || null;
};

/**
 * Links a new identity to an existing user.
 */
export const linkIdentity = (db: DB) => async (
    userId: string,
    provider: AuthProvider,
    providerUserId: string,
    email: string | null
): Promise<UserIdentityDB> => {
    const [identity] = await db.insert('user_identities', [{
        user_id: userId,
        provider,
        provider_user_id: providerUserId,
        email,
    }]);
    return identity;
};

/**
 * Updates last_login_at on an existing identity.
 */
export const touchIdentityLogin = (db: DB) => async (identityId: string): Promise<void> => {
    await db.query(`UPDATE user_identities SET last_login_at = NOW() WHERE id = $1`, [identityId]);
};
