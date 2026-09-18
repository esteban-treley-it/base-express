/**
 * Structured Logger
 *
 * Thin wrapper over console.* gated by a numeric log level (app.logLevel),
 * so verbosity is controlled centrally via LOG_LEVEL instead of scattered
 * console.log calls.
 */

import { app } from '@/config';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

export const logger = {
    debug: (scope: string, ...args: unknown[]): void => {
        if (app.logLevel >= LEVELS.debug) console.debug(`[${scope}]`, ...args);
    },
    info: (scope: string, ...args: unknown[]): void => {
        if (app.logLevel >= LEVELS.info) console.info(`[${scope}]`, ...args);
    },
    warn: (scope: string, ...args: unknown[]): void => {
        if (app.logLevel >= LEVELS.warn) console.warn(`[${scope}]`, ...args);
    },
    error: (scope: string, ...args: unknown[]): void => {
        if (app.logLevel >= LEVELS.error) console.error(`[${scope}]`, ...args);
    },
};

export default logger;
