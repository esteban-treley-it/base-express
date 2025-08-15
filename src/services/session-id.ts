import crypto from 'crypto'
import { app, tokens } from "@/config"

export const generateSignedSid = (sid: string) => {
    const signature = crypto.createHmac("sha256", app.hmacSecret).update(sid).digest('base64url')

    return `${sid}.${signature}`
}

export const verifySignedSid = (signedSid: string) => {
    const [sid, signature] = signedSid.split(".")
    const expectedSign = crypto.createHmac("sha256", app.hmacSecret).update(sid).digest('base64url')
    return signature === expectedSign
}

export const getOriginalSid = (signedSid: string) => {
    const [sid] = signedSid.split(".")
    return sid
}

export const getSidExpirationSQL = () => new Date(Date.now() + tokens.expiry.refresh).toISOString()