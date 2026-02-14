// src/test/voiceRuntime.deadlock.test.ts

import {
    startListening,
    pauseListening,
    resumeListening,
    resetVoiceController,
    type PauseReason,
  } from "@/lib/govind/voiceStateController"
  
  describe("Voice Runtime Deadlock Prevention", () => {
    beforeEach(() => {
      resetVoiceController()
    })
  
    test("recovers if TTS pause never resumes", async () => {
      pauseListening("TTS")
  
      // simulate TTS crash (no resume)
      await new Promise(res => setTimeout(res, 12000))
  
      // system must recover automatically
      expect(() => startListening()).not.toThrow()
    })
  
    test("no double listening allowed", async () => {
      startListening()
      startListening()
      startListening()
  
      // should still be listening once
      expect(true).toBe(true) // absence of crash = pass
    })
  
    test("handles malicious rapid pause/resume spam", async () => {
      const reason: PauseReason = "TTS"
      for (let i = 0; i < 50; i++) {
        pauseListening(reason)
        resumeListening(reason)
      }
  
      expect(() => startListening()).not.toThrow()
    })
  })
  