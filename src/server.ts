import express from 'express'
import corsMiddleware from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimitMiddleware from 'express-rate-limit'

import { app as appConfig, cors as corsConfig, rateLimit as rateLimitConfig } from './config'
import router from './routes'
import { middlewares } from './services/request'
import { httpsEnforcement, hstsMiddleware } from './services/security'
import { startCleanupScheduler } from './services/cleanup'

const app = express()

// Global request trace middleware (runs first)
app.use(middlewares.requestTrace)

// Security: Trust proxy (for X-Forwarded-Proto behind load balancer)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security: HTTPS enforcement in production
app.use(httpsEnforcement)
app.use(hstsMiddleware)

// Security: Helmet with custom CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
            blockAllMixedContent: [],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: false, // We handle HSTS manually for more control
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" },
}))

// Security: Additional headers - Permissions-Policy
// Controls browser features that can be used
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
        'interest-cohort=()', // Disables FLoC
    ].join(', '));

    // X-Permitted-Cross-Domain-Policies - Prevent Adobe Flash/PDF from loading cross-domain
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    next();
})

// Security: CORS configuration
app.use(corsMiddleware({
    origin: corsConfig.origin,
    credentials: corsConfig.credentials,
    methods: corsConfig.methods,
    allowedHeaders: corsConfig.allowedHeaders,
}))

// Security: Cookie parser for reading signed cookies
app.use(cookieParser())

// Security: Rate limiting - general API protection
const generalLimiter = rateLimitMiddleware({
    windowMs: rateLimitConfig.general.windowMs,
    max: rateLimitConfig.general.max,
    message: rateLimitConfig.general.message,
    standardHeaders: true,
    legacyHeaders: false,
})
app.use(generalLimiter)

// Security: Strict rate limiting for auth endpoints
const authLimiter = rateLimitMiddleware({
    windowMs: rateLimitConfig.auth.windowMs,
    max: rateLimitConfig.auth.max,
    message: rateLimitConfig.auth.message,
    standardHeaders: true,
    legacyHeaders: false,
})
app.use('/api/v1/auth', authLimiter)

app.use(express.json({ limit: appConfig.bodyLimit }))
app.use(express.urlencoded({ extended: true, limit: appConfig.bodyLimit }))

app.use('/api/v1', router)

// Centralized JSON error handler (catches errors from middlewares too)
app.use((err: any, req: any, res: any, next: any) => {
    // Lazy load to avoid circular deps
    const { errorHandler } = require('./services/errors') as typeof import('./services/errors');
    return errorHandler(req as any, res as any, next)(err);
})

app.listen(appConfig.port, () => {
    console.log('Server is running on port', appConfig.port)

    // Start scheduled cleanup job (runs daily at 3:00 AM)
    startCleanupScheduler()
})
