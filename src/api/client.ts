// src/api/client.ts

import { auth } from "@/lib/firebase/firebase";

export interface ApiResponse<T = any> {
    success: boolean;
    data: T;
    error: {
        code: string;
        message: string;
    } | null;
}

export interface ApiRequestOptions extends RequestInit {
    googleToken?: string;
}

class ApiClient {
    private baseUrl = ""; // Relative to deployment, e.g., /api/v1

    /**
     * Inject headers and handle request
     */
    private async request<T>(
        endpoint: string,
        options: ApiRequestOptions = {},
        retryCount = 0
    ): Promise<ApiResponse<T>> {
        const requestId = crypto.randomUUID();
        const headers = new Headers(options.headers);

        // 1. Inject ID Token
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdToken();
            headers.set("Authorization", `Bearer ${token}`);
        }

        // 2. Inject Google Token if provided
        if (options.googleToken) {
            headers.set("x-google-token", options.googleToken);
        }

        // 3. Inject Request ID
        headers.set("x-request-id", requestId);
        headers.set("Content-Type", "application/json");

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers,
            });

            // 3. Handle Token Refresh (401)
            if (response.status === 401 && retryCount < 1) {
                console.warn("[API] 401 Unauthorized. Refreshing token and retrying...");
                if (user) {
                    await user.getIdToken(true); // Force refresh
                    return this.request<T>(endpoint, options, retryCount + 1);
                }
            }

            // [FIX] Validate JSON content type before parsing (Step 3)
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("[API] Expected JSON but received:", contentType, text.slice(0, 100));
                throw new Error("Server did not return JSON. Possible 404 or redirect.");
            }

            const data = await response.json();
            console.log(`[API] RAW RESPONSE [${endpoint}]:`, data);

            // Ensure unified format even if backend fails to provide it
            if (!response.ok) {
                return {
                    success: false,
                    data: null as any,
                    error: data.error || {
                        code: "SERVER_ERROR",
                        message: data.message || "An unexpected error occurred",
                    },
                };
            }

            return data as ApiResponse<T>;
        } catch (error: any) {
            console.error(`[API] Request failed: ${endpoint}`, error);
            return {
                success: false,
                data: null as any,
                error: {
                    code: "NETWORK_ERROR",
                    message: error.message || "Network request failed",
                },
            };
        }
    }

    async get<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: "GET" });
    }

    async post<T>(endpoint: string, body: any, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: "POST",
            body: JSON.stringify(body),
        });
    }

    async put<T>(endpoint: string, body: any, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            ...options,
            method: "PUT",
            body: JSON.stringify(body),
        });
    }

    async delete<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { ...options, method: "DELETE" });
    }
}

export const apiClient = new ApiClient();
