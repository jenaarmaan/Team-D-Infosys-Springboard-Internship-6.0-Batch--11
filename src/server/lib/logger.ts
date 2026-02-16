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
        const errorDetail = {
            message: error?.message || String(error),
            code: error?.code || 'INTERNAL_ERROR',
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        };

        console.error(`🛑 [ERROR] ${message}:`, errorDetail.message, context);

        try {
            console.error(JSON.stringify({
                level: 'error',
                message,
                timestamp: new Date().toISOString(),
                error: errorDetail,
                ...context
            }));
        } catch (e) {
            console.error("Critical: Logger failed to stringify error", message);
        }
    }
};
