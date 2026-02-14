// /lib/identity/sessionManager.ts

/* =========================================================
   Session Manager — Identity Persistence
   ---------------------------------------------------------
   - Create session
   - Restore session
   - Destroy session
   - Local-first (can be swapped later)
   ========================================================= */

export type SessionUser = {
  userId: string;
  name?: string;
  email?: string;
};

export type SessionState = {
  isAuthenticated: boolean;
  user: SessionUser | null;
  sessionId: string | null;
  createdAt: number | null;
};

const SESSION_STORAGE_KEY = "__govind_identity_session__";

/* ---------------------------------------------------------
   Create session
--------------------------------------------------------- */
export function createSession(user: SessionUser): SessionState {
  const session: SessionState = {
    isAuthenticated: true,
    user,
    sessionId: generateSessionId(),
    createdAt: Date.now(),
  };

  persistSession(session);
  return session;
}

/* ---------------------------------------------------------
   Restore session (on app reload)
--------------------------------------------------------- */
export function restoreSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed: SessionState = JSON.parse(raw);

    if (!parsed.sessionId || !parsed.user) {
      destroySession();
      return null;
    }

    return parsed;
  } catch {
    destroySession();
    return null;
  }
}

/* ---------------------------------------------------------
   Destroy session (logout)
--------------------------------------------------------- */
export function destroySession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

/* ---------------------------------------------------------
   Internal helpers
--------------------------------------------------------- */
function persistSession(session: SessionState): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function generateSessionId(): string {
  return (
    "sess_" +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}
