// src/privacy/entities.ts

export type EntityType =
    | "OTP"
    | "EMAIL"
    | "PHONE"
    | "AADHAAR"
    | "PAN"
    | "BANK_ACCOUNT"
    | "PASSWORD"
    | "SECRET_KEY";

export interface EntitySpan {
    type: EntityType;
    start: number;
    end: number;
    value: string;
}

export interface SanitizedResult {
    originalText: string;
    sanitizedText: string;
    localMap: Record<string, string>;
    entities: EntitySpan[];
}
