/**
 * Production-Grade Structured Logger
 * Injects context (UID, Request ID) into every log for traceability.
 */
export const logger = {
    info: (message: string, context: Record<string, any> = {}) => {
        console.log(JSON.stringify({
            level: 'info',
            message,
            timestamp: new Date().toISOString(),
            ...context
        }));
    },
    warn: (message: string, context: Record<string, any> = {}) => {
        console.warn(JSON.stringify({
            level: 'warn',
            message,
            timestamp: new Date().toISOString(),
            ...context
        }));
    },
    error: (message: string, error: any, context: Record<string, any> = {}) => {
        console.error(JSON.stringify({
            level: 'error',
            message,
            timestamp: new Date().toISOString(),
            error: {
                message: error.message,
                code: error.code || 'INTERNAL_ERROR',
                // Stack trace omitted in production via NODE_ENV check if desired
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            ...context
        }));
    }
};
