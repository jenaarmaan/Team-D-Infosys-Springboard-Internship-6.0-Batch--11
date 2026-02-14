// src/lib/platforms/platformRegistry.ts

import { PlatformAdapter } from "./platformTypes";

const registry: Map<string, PlatformAdapter> = new Map();

export const registerPlatform = (adapter: PlatformAdapter) => {
    registry.set(adapter.id, adapter);
    console.log(`[PLATFORM] Registered: ${adapter.name}`);
};

export const getPlatform = (id: string): PlatformAdapter | undefined => {
    return registry.get(id);
};

export const getAllPlatforms = (): PlatformAdapter[] => {
    return Array.from(registry.values());
};
