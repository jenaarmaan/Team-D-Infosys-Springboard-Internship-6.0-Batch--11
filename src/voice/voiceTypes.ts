// src/voice/voiceTypes.ts

/**
 * Current active voice pipeline
 */
export type VoiceMode = "GLOBAL" | "GMAIL";

/**
 * Standard return type for voice pipelines
 */
export interface VoiceCommandResult {
  handled: boolean;
  message?: string;
}
/**
 * Canonical voice events emitted by Voice Runtime
 * Stage-1 locked
 */
export type VoiceEvent =
  | {
      type: "TRANSCRIPT";
      text: string;
      timestamp: number;
    }
  | {
      type: "SPEAK";
      text: string;
    }
  | {
      type: "ERROR";
      reason: string;
    };
/**
 * Voice engine lifecycle signals
 */
export type VoiceLifecycleEvent =
  | "VOICE_START"
  | "VOICE_STOP"
  | "VOICE_PAUSE"
  | "VOICE_RESUME";

  /**
 * Normalized voice error payload
 */
export interface VoiceError {
  source: "ASR" | "TTS" | "MIC" | "UNKNOWN";
  message: string;
  recoverable: boolean;
}
/**
 * Immutable chat log entry (ground truth)
 */
export interface VoiceChatLogEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source: "speech" | "system";
}
/* ======================================================
   🔐 AUTH INTENTS (STAGE-2)
   ====================================================== */

export type AuthIntent =
  | "LOGIN"
  | "REGISTER"
  | "LOGOUT";
/* ======================================================
   ❌ AUTH FAILURE REASONS (STAGE-2)
   ====================================================== */

export type AuthFailureReason =
  | "VOICE_MISMATCH"
  | "NO_REGISTERED_USER"
  | "SESSION_EXPIRED"
  | "MIC_DENIED"
  | "TIMEOUT"
  | "UNKNOWN";
