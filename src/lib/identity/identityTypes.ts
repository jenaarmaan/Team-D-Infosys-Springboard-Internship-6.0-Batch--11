// /lib/identity/identityTypes.ts

/* =========================================================
   Identity & Trust — Type Contracts
   ---------------------------------------------------------
   - User identity
   - Voice print
   - Session state
   - No logic, no storage, no side effects
   ========================================================= */

/* ---------------------------------------------------------
   Voice print (biometric reference)
--------------------------------------------------------- */
export type VoicePrint = {
  embedding: number[];
  createdAt: number;
};

/* ---------------------------------------------------------
   User identity (registered user)
--------------------------------------------------------- */
export type UserIdentity = {
  userId: string;
  name?: string;
  email?: string;
  voicePrint: VoicePrint;
  registeredAt: number;
};

/* ---------------------------------------------------------
   Session state (runtime authentication)
--------------------------------------------------------- */
export type SessionState = {
  isAuthenticated: boolean;
  user: {
    userId: string;
    name?: string;
    email?: string;
  } | null;
  sessionId: string | null;
  createdAt: number | null;
};
