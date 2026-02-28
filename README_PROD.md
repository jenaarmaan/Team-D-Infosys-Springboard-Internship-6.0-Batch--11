# Govind - Secure Voice-First Communication Assistant

This repository contains the production-grade implementation of **Govind**, a voice-first assistant designed for secure communication via Telegram and Gemini AI.

## 🏛️ Architecture Overview

The project follows a modern **Serverless Service-Service** architecture optimized for Vercel.

User → Frontend (React + Vite) → Vercel Serverless (API v1) → Services → External Providers (Gemini/Telegram)

### Key Architectural Layers:
- **Frontend**: Clean React-TS UI with a unified API client.
- **API v1**: Versioned route handlers with centralized middleware.
- **Service Layer**: Business logic decoupled from HTTP transport.
- **Security Layer**: Firebase Admin integration, RBAC-ready auth, and Webhook idempotency.

## 🛡️ Security Design (Audit-Ready)

1. **Zero Client-Side Secrets**: All third-party API keys (Gemini, Telegram) are stored as private environment variables on Vercel. No keys are exposed to the browser.
2. **Standardized Middleware**: All `/api/v1` routes are protected by a middleware that verifies Firebase Auth ID tokens and attaches request-ids for traceability.
3. **Webhook Idempotency**: Incoming Telegram updates are tracked via `update_id` in Firestore to prevent duplicate processing.
4. **Prompt Guardrails**: AI inputs are sanitized, and mandatory system-level guardrails are enforced on the backend to prevent prompt injection.
5. **Rate Limiting**: Fair usage is enforced per User UID and Endpoint using a leaking-bucket strategy.

## 🚀 Deployment Guide

### Prerequisites
- Node.js 18+
- Vercel CLI
- Firebase Project with Service Account

### Environment Variables
Configure the following in your Vercel Dashboard:
- `FIREBASE_SERVICE_ACCOUNT_KEY`: (JSON)
- `GEMINI_API_KEY`: (Private)
- `TELEGRAM_BOT_TOKEN`: (Private)
- `TELEGRAM_WEBHOOK_SECRET`: (Private)
- `UPSTASH_REDIS_REST_URL`: (Optional - for advanced rate limiting)

### Run Locally
```bash
npm install
npm run dev
```

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
