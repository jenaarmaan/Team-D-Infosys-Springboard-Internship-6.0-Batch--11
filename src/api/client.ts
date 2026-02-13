import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Unified API Client for Govind Production
 * Automatically handles versioning and authentication token injection.
 */
class ApiClient {
    private axiosInstance: AxiosInstance;
    private idToken: string | null = null;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: '/api/v1',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Request ID & Auth Injection Middleware
        this.axiosInstance.interceptors.request.use((config) => {
            // 1. Inject Authentication Token
            if (this.idToken) {
                config.headers.Authorization = `Bearer ${this.idToken}`;
            }

            // 2. Inject Request ID for Traceability
            const requestId = `req-${Math.random().toString(36).substring(2, 11)}`;
            config.headers['X-Request-ID'] = requestId;

            return config;
        });

        // Standardized Error Handler
        this.axiosInstance.interceptors.response.use(
            (response) => {
                // Enforce unified JSON response format from backend
                if (response.data.success === false) {
                    return Promise.reject(response.data.error);
                }
                return response;
            },
            (error) => {
                const unifiedError = {
                    code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
                    message: error.response?.data?.error?.message || error.message,
                    details: error.response?.data?.error?.details
                };
                console.error('[API CLIENT ERROR]', unifiedError);
                return Promise.reject(unifiedError);
            }
        );
    }

    /**
     * Update the internal Auth Token (called after Firebase Auth changes)
     */
    setAuthToken(token: string | null) {
        this.idToken = token;
    }

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.get<{ success: true; data: T }>(url, config);
        return response.data.data;
    }

    async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.post<{ success: true; data: T }>(url, data, config);
        return response.data.data;
    }
}

export const apiClient = new ApiClient();
