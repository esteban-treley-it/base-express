export interface ValidateTokens {
    accessToken?: string
    idToken?: string
    refreshToken?: string
}

export type TokenStatus =
    | { status: "valid"; tokens: { idToken: unknown; accessToken: unknown } }
    | { status: "expired" }
    | { status: "invalid" };