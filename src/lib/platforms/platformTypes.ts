// src/lib/platforms/platformTypes.ts

import { ResolvedIntent } from "@/lib/govind/intentMap";

/**
 * Platform execution result
 */
export interface ExecutionResult {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

/**
 * Standard interface for platform adapters
 */
export interface PlatformAdapter {
    id: string;
    name: string;
    execute: (intent: ResolvedIntent) => Promise<ExecutionResult>;
}
