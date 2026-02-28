// src/services/messagingPlatformService.ts

import { ResolvedIntent, TargetPlatform } from "@/lib/govind/intentMap";
import { routeToPlatform } from "@/lib/platforms/platformRouter";
import { ExecutionResult } from "@/lib/platforms/platformTypes";

export interface PendingAction {
    platform: TargetPlatform;
    intent: ResolvedIntent;
    data: any;
}

import { getTelegramClient } from "@/lib/telegram/telegramClient";

class MessagingPlatformService {
    private activePlatform: TargetPlatform | null = null;
    private pendingAction: PendingAction | null = null;

    setActivePlatform(platform: TargetPlatform) {
        this.activePlatform = platform;
        console.log(`[MESSAGING] Active platform set to: ${platform}`);
    }

    async initialize(): Promise<{ telegram: boolean }> {
        let telegramReady = false;
        try {
            const client = getTelegramClient();
            await client.connect();
            telegramReady = true;
            console.log("[MESSAGING] Telegram initialized successfully for production");
        } catch (err) {
            console.error("[MESSAGING] Telegram init failed:", err);
        }

        return {
            telegram: telegramReady,
        };
    }

    getActivePlatform(): TargetPlatform | null {
        return this.activePlatform;
    }

    setPendingAction(action: PendingAction | null) {
        this.pendingAction = action;
    }

    getPendingAction(): PendingAction | null {
        return this.pendingAction;
    }

    async handleIntent(intent: ResolvedIntent): Promise<ExecutionResult> {
        const action = intent.action;

        // 1. Handle Confirmation / Cancellation
        if (action === "CONFIRM") {
            return this.executePendingAction();
        }

        if (action === "CANCEL") {
            this.clearPendingAction();
            return { success: true, message: "Action cancelled. I've discarded the draft." };
        }

        // 2. Track platform context & Routing
        let targetPlatform = intent.platform;
        if (intent.platform !== "system") {
            this.activePlatform = intent.platform;
        } else if (this.activePlatform) {
            targetPlatform = this.activePlatform;
        }

        // 3. Route to platform
        const result = await routeToPlatform({ ...intent, platform: targetPlatform });


        // 4. Handle Draft Flow (Interception)
        if (result.success && result.data?.type === "DRAFT") {
            this.pendingAction = {
                platform: intent.platform,
                intent: intent,
                data: result.data
            };
            // Note: result.message should already say "Do you want to send it?"
        }

        return result;
    }

    private async executePendingAction(): Promise<ExecutionResult> {
        if (!this.pendingAction) {
            return { success: false, message: "There's nothing to confirm right now." };
        }

        const { platform, intent, data } = this.pendingAction;

        // Convert DRAFT to SEND/REPLY intent
        const sendIntent: ResolvedIntent = {
            ...intent,
            action: "SEND", // Default execution after confirmation is SEND
            entities: {
                ...intent.entities,
                to: data.phoneNumber || intent.entities.to,
                body: data.body || intent.entities.body
            }
        };

        this.clearPendingAction();
        return await routeToPlatform(sendIntent);
    }

    private clearPendingAction() {
        this.pendingAction = null;
    }
}

export const messagingPlatformService = new MessagingPlatformService();
