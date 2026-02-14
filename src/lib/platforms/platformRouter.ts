// src/lib/platforms/platformRouter.ts

import { ResolvedIntent } from "@/lib/govind/intentMap";
import { getPlatform } from "./platformRegistry";
import { ExecutionResult } from "./platformTypes";

/**
 * 脊椎 (SPINE) — Platform Execution Router
 * Routes a resolved intent to the correct adapter.
 */
export const routeToPlatform = async (intent: ResolvedIntent): Promise<ExecutionResult> => {
    if (intent.platform === "system") {
        return { success: true, message: "System intent — no platform required." };
    }

    const adapter = getPlatform(intent.platform);

    if (!adapter) {
        return {
            success: false,
            message: `Platform ${intent.platform} not found or not initialized.`,
            error: "PLATFORM_MISSING"
        };
    }

    try {
        return await adapter.execute(intent);
    } catch (err: any) {
        return {
            success: false,
            message: `Execution failed on ${intent.platform}.`,
            error: err?.message || "EXECUTION_ERROR"
        };
    }
};
