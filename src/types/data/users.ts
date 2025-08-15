export interface UserTokenData {
    user_id: string;
    name: string;
    email: string;
    is_owner: boolean;
    org: {
        id?: string;
        name?: string;
        key?: string;
        role?: string;
    }
}