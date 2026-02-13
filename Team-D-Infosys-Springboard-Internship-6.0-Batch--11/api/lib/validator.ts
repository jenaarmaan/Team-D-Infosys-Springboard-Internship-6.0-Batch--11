/**
 * Input Sanitization & Validation Utility
 */
export const validator = {
    /**
     * Strips HTML and dangerous characters to prevent injection
     */
    sanitize: (input: string): string => {
        if (typeof input !== 'string') return '';
        return input
            .replace(/<[^>]*>?/gm, '') // Strip HTML tags
            .replace(/[^\w\s.,?!'"-]/gi, '') // Allow alphanumeric + standard punctuation
            .trim();
    },

    /**
     * Validates request body against a simple schema
     */
    validateBody: (body: any, requiredFields: string[]): { valid: boolean; missing?: string } => {
        if (!body || typeof body !== 'object') return { valid: false };
        for (const field of requiredFields) {
            if (!(field in body) || body[field] === undefined || body[field] === null) {
                return { valid: false, missing: field };
            }
        }
        return { valid: true };
    }
};
