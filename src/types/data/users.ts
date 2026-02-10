export interface UserOrg {
    id?: string;
    name?: string;
    key?: string;
    role?: string;
}

export interface UserTokenData {
    user_id: string;
    name: string;
    email: string;
    org?: UserOrg; // Only populated when MULTI_TENANT=true
}