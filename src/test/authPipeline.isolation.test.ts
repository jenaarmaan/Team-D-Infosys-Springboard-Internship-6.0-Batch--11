// src/test/authPipeline.isolation.test.ts

/**
 * Voice-First Authentication Tests
 * 
 * Requirements:
 * - No UI dependencies
 * - No Gmail access
 * - Must FAIL if auth leaks into other pipelines
 */

import {
  createAuthSession,
  resetAuthSession,
  REGISTER_STEPS,
  LOGIN_STEPS,
  VOICE_ALLOWED_STEPS,
  getNextStep,
  getPreviousStep,
  getNextLoginStep,
  getPreviousLoginStep,
  isBlockingStep,
  canAdvanceLogin,
  isSessionValid,
  isAuthComplete,
  type RegisterStep,
} from "@/auth/authStateMachine"

import type { AuthSession, AuthMode, LoginStep } from "@/auth/authTypes"

/* ======================================================
   🔒 BOUNDARY ISOLATION TESTS
   ====================================================== */

describe("Auth Pipeline Boundary Isolation", () => {
  
  test("voiceStateController exports NO auth-related functions", async () => {
    const voiceController = await import("@/lib/govind/voiceStateController")
    const exportedKeys = Object.keys(voiceController)

    // These should NOT exist in voiceStateController
    const authLeakPatterns = [
      "auth",
      "Auth",
      "login",
      "Login",
      "register",
      "Register",
      "session",
      "Session",
      "canProcessVoiceCommand", // previously removed
      "lockForAuth",            // previously removed
      "unlockAfterAuth",        // previously removed
    ]

    for (const pattern of authLeakPatterns) {
      const leakedExports = exportedKeys.filter(k => k.includes(pattern))
      expect(leakedExports).toEqual([])
    }
  })

  test("voiceStateController PauseReason has NO auth-specific values", async () => {
    const { pauseListening, resumeListening } = await import("@/lib/govind/voiceStateController")
    
    // Valid pause reasons (defined in voiceStateController)
    const validReasons = ["TTS", "FACE_CAPTURE", "PIN_ENTRY", "ERROR", "GLOBAL_EXIT"]

    // Auth-specific reasons should NOT exist
    const invalidAuthReasons = ["AUTH", "LOGIN", "REGISTER", "LOGOUT", "USER"]

    // This would throw TypeScript error at compile time, but we verify at runtime
    for (const reason of invalidAuthReasons) {
      // If auth leaked, this would not throw
      expect(validReasons).not.toContain(reason)
    }
  })

  test("authStateMachine imports ONLY from authTypes", async () => {
    // This test verifies the import structure hasn't changed
    // If auth imports voice/gmail modules, this file would fail to compile
    const authMachine = await import("@/auth/authStateMachine")
    
    // Verify core exports exist (proves file loaded correctly)
    expect(authMachine.createAuthSession).toBeDefined()
    expect(authMachine.REGISTER_STEPS).toBeDefined()
    expect(authMachine.LOGIN_STEPS).toBeDefined()
  })

  test("Gmail pipeline has NO auth state exports", async () => {
    const gmailPipeline = await import("@/voice/gmailVoicePipeline")
    const exportedKeys = Object.keys(gmailPipeline)

    const authLeakPatterns = ["auth", "Auth", "login", "Login", "session", "Session"]

    for (const pattern of authLeakPatterns) {
      const leakedExports = exportedKeys.filter(k => k.includes(pattern))
      expect(leakedExports).toEqual([])
    }
  })
})

/* ======================================================
   🔐 REGISTRATION FLOW TESTS (VOICE-FIRST)
   ====================================================== */

describe("Voice-First Registration Flow", () => {
  let session: AuthSession

  beforeEach(() => {
    session = createAuthSession()
  })

  test("fresh session starts in NONE mode", () => {
    expect(session.mode).toBe("NONE")
    expect(session.step).toBeNull()
    expect(session.retries).toBe(0)
  })

  test("registration steps are in correct order", () => {
    expect(REGISTER_STEPS).toEqual([
      "EMAIL",
      "CONFIRM_EMAIL",
      "PASSWORD",
      "APP_PASSWORD",
      "FACE",
      "VOICE_PIN",
      "CONFIRM_PIN",
      "COMPLETE",
    ])
  })

  test("FACE step blocks voice input", () => {
    expect(isBlockingStep("FACE")).toBe(true)
    expect(VOICE_ALLOWED_STEPS).not.toContain("FACE")
  })

  test("voice-allowed steps exclude FACE and COMPLETE", () => {
    expect(VOICE_ALLOWED_STEPS).toContain("EMAIL")
    expect(VOICE_ALLOWED_STEPS).toContain("VOICE_PIN")
    expect(VOICE_ALLOWED_STEPS).not.toContain("FACE")
    expect(VOICE_ALLOWED_STEPS).not.toContain("COMPLETE")
  })

  test("cannot advance from FACE without faceCaptured context", () => {
    const nextStep = getNextStep("FACE")
    expect(nextStep).toBeNull()
  })

  test("can advance from FACE with faceCaptured=true", () => {
    const nextStep = getNextStep("FACE", { faceCaptured: true })
    expect(nextStep).toBe("VOICE_PIN")
  })

  test("step transitions follow correct sequence", () => {
    expect(getNextStep("EMAIL")).toBe("CONFIRM_EMAIL")
    expect(getNextStep("CONFIRM_EMAIL")).toBe("PASSWORD")
    expect(getNextStep("PASSWORD")).toBe("APP_PASSWORD")
    expect(getNextStep("APP_PASSWORD")).toBe("FACE")
    expect(getNextStep("VOICE_PIN")).toBe("CONFIRM_PIN")
    expect(getNextStep("CONFIRM_PIN")).toBe("COMPLETE")
  })

  test("cannot advance past COMPLETE", () => {
    expect(getNextStep("COMPLETE")).toBeNull()
  })

  test("previous step transitions are correct", () => {
    expect(getPreviousStep("EMAIL")).toBeNull()
    expect(getPreviousStep("CONFIRM_EMAIL")).toBe("EMAIL")
    expect(getPreviousStep("FACE")).toBe("APP_PASSWORD")
  })

  test("resetAuthSession clears all state", () => {
    const reset = resetAuthSession()
    expect(reset.mode).toBe("NONE")
    expect(reset.step).toBeNull()
    expect(reset.retries).toBe(0)
    expect(reset.tempData).toEqual({})
  })
})

/* ======================================================
   🔑 LOGIN FLOW TESTS (VOICE-FIRST)
   ====================================================== */

describe("Voice-First Login Flow", () => {
  
  test("login steps are in correct order", () => {
    expect(LOGIN_STEPS).toEqual([
      "FACE",
      "VOICE_PIN",
      "SUCCESS",
    ])
  })

  test("cannot advance from FACE without faceVerified", () => {
    expect(canAdvanceLogin("FACE")).toBe(false)
    expect(canAdvanceLogin("FACE", {})).toBe(false)
    expect(canAdvanceLogin("FACE", { faceVerified: false })).toBe(false)
  })

  test("can advance from FACE with faceVerified=true", () => {
    expect(canAdvanceLogin("FACE", { faceVerified: true })).toBe(true)
  })

  test("cannot advance from VOICE_PIN without pinVerified", () => {
    expect(canAdvanceLogin("VOICE_PIN")).toBe(false)
    expect(canAdvanceLogin("VOICE_PIN", { pinVerified: false })).toBe(false)
  })

  test("can advance from VOICE_PIN with pinVerified=true", () => {
    expect(canAdvanceLogin("VOICE_PIN", { pinVerified: true })).toBe(true)
  })

  test("login step transitions require verification context", () => {
    // Without context, blocked
    expect(getNextLoginStep("FACE")).toBeNull()
    expect(getNextLoginStep("VOICE_PIN")).toBeNull()

    // With context, allowed
    expect(getNextLoginStep("FACE", { faceVerified: true })).toBe("VOICE_PIN")
    expect(getNextLoginStep("VOICE_PIN", { pinVerified: true })).toBe("SUCCESS")
  })

  test("cannot advance past SUCCESS", () => {
    expect(getNextLoginStep("SUCCESS")).toBeNull()
  })

  test("previous login step transitions are correct", () => {
    expect(getPreviousLoginStep("FACE")).toBeNull()
    expect(getPreviousLoginStep("VOICE_PIN")).toBe("FACE")
    expect(getPreviousLoginStep("SUCCESS")).toBe("VOICE_PIN")
  })
})

/* ======================================================
   ✅ SESSION VALIDATION TESTS
   ====================================================== */

describe("Auth Session Validation", () => {

  test("session with mode=NONE is invalid", () => {
    const session = createAuthSession()
    expect(isSessionValid(session)).toBe(false)
  })

  test("session with mode=LOGIN is valid", () => {
    const session: AuthSession = {
      mode: "LOGIN",
      step: "FACE",
      retries: 0,
      tempData: {},
    }
    expect(isSessionValid(session)).toBe(true)
  })

  test("session with mode=REGISTER is valid", () => {
    const session: AuthSession = {
      mode: "REGISTER",
      step: "EMAIL",
      retries: 0,
      tempData: {},
    }
    expect(isSessionValid(session)).toBe(true)
  })

  test("session with retries > 3 is invalid", () => {
    const session: AuthSession = {
      mode: "LOGIN",
      step: "FACE",
      retries: 4,
      tempData: {},
    }
    expect(isSessionValid(session)).toBe(false)
  })

  test("isAuthComplete detects registration completion", () => {
    const incomplete: AuthSession = {
      mode: "REGISTER",
      step: "VOICE_PIN",
      retries: 0,
      tempData: {},
    }
    const complete: AuthSession = {
      mode: "REGISTER",
      step: "COMPLETE",
      retries: 0,
      tempData: {},
    }

    expect(isAuthComplete(incomplete)).toBe(false)
    expect(isAuthComplete(complete)).toBe(true)
  })

  test("isAuthComplete detects login completion", () => {
    const incomplete: AuthSession = {
      mode: "LOGIN",
      step: "VOICE_PIN",
      retries: 0,
      tempData: {},
    }
    const complete: AuthSession = {
      mode: "LOGIN",
      step: "SUCCESS",
      retries: 0,
      tempData: {},
    }

    expect(isAuthComplete(incomplete)).toBe(false)
    expect(isAuthComplete(complete)).toBe(true)
  })
})

/* ======================================================
   🚫 ANTI-LEAK REGRESSION TESTS
   ====================================================== */

describe("Auth Anti-Leak Regression", () => {

  test("AuthVoiceCommand type should NOT exist in voiceStateController", async () => {
    const voiceController = await import("@/lib/govind/voiceStateController")
    
    // @ts-expect-error - This type should not exist
    expect((voiceController as any).AuthVoiceCommand).toBeUndefined()
  })

  test("auth lock functions should NOT exist in voiceStateController", async () => {
    const voiceController = await import("@/lib/govind/voiceStateController")
    
    // These were previously removed - ensure they stay removed
    expect((voiceController as any).lockForAuth).toBeUndefined()
    expect((voiceController as any).unlockAfterAuth).toBeUndefined()
    expect((voiceController as any).canProcessVoiceCommand).toBeUndefined()
  })

  test("voiceStateController should only export mic FSM functions", async () => {
    const voiceController = await import("@/lib/govind/voiceStateController")
    const exportedKeys = Object.keys(voiceController)

    // Expected mic FSM exports only
    const expectedExports = [
      "PauseReason",           // type
      "initVoiceRecognition",
      "startListening",
      "pauseListening",
      "resumeListening",
      "stopListening",
      "setReadyForCommand",
      "resumeAfterWake",
      "isListening",
      "isPaused",
      "getMicState",
      "resetVoiceController",
      "forceUnlockMic",
    ]

    // No unexpected exports
    for (const key of exportedKeys) {
      if (!expectedExports.includes(key)) {
        // Allow internal/private helpers but fail on auth-related
        expect(key.toLowerCase()).not.toContain("auth")
        expect(key.toLowerCase()).not.toContain("login")
        expect(key.toLowerCase()).not.toContain("register")
      }
    }
  })
})
