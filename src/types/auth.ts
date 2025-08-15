export interface IdTokenData {
    sid: string
    user: {
        id: string
        email: string,
        is_owner: boolean,
        org: {
            id?: string,
            role?: string
        }
    }
}
export interface AccessTokenData {
    sid: string
    user: {
        id: string
        email: string,
        is_owner: boolean,
    }
}

export interface RefreshTokenData {
    sid: string
    user: {
        id: string
        email: string
        org_id: string
    }
}