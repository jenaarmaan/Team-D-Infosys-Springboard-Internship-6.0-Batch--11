// src/lib/govind/voiceLifecycle.ts

import { canAcceptVoice, canRestartMic } from "./stateMachine";
import type { GovindState } from "./stateMachine";
import {
  resumeAfterWake,
  startListening,
} from "@/lib/govind/voiceStateController";
import { VoiceEvent } from "@/voice/voiceTypes";

/**
 * Wires SpeechRecognition → Govind logic
 * SINGLE transcript entry point
 *
 * This file owns:
 * - recognition.onresult
 * - global command preemption
 * - state-based voice gating
 * - safe auto-restart
 *
 * 🚫 No Firebase
 * 🚫 No UI
 * 🚫 No TTS
 */
let lastTranscript = "";
let lastTranscriptTime = 0;
let wakeListenerBound = false;

export const bindVoiceLifecycle = (
  recognition: any,
  getState: () => GovindState,
  handleIntent: (text: string) => void,
  resetSystem: () => void,
  getSensitivity: () => number
) => {
  if (!recognition) {
    console.error("[VOICE] Recognition instance missing");
    return;
  }

  // 👂 Wake/Sleep Listeners (Wiring)
  if (!wakeListenerBound) {
    window.addEventListener("govind:wake", () => {
      console.log("[VOICE] Wake received — clearing GLOBAL_EXIT");
      resumeAfterWake();
    });
    wakeListenerBound = true;
  }

  recognition.onresult = (event: any) => {
    console.log("[VOICE] onresult received. Count:", event.results.length);
    try {
      if (!event.results[event.results.length - 1].isFinal) {
        return;
      }

      const resultIndex = event.results.length - 1;
      const result = event.results[resultIndex][0];
      const transcript = result.transcript.trim();
      const confidence = result.confidence || 1.0;
      const normalizedTranscript = transcript.toLowerCase();

      if (!transcript) return;

      // 🎚️ Apply Sensitivity (Confidence Threshold)
      // sensitivity 100 -> threshold 0.1
      // sensitivity 0 -> threshold 0.95
      const sensitivity = getSensitivity();
      const threshold = 0.95 - (sensitivity / 100) * 0.85;

      // 🟢 WAKE WORD (Internal Runtime Logic)
      const wakeWords = ["hey govind", "hi govind", "hello govind", "ok govind", "hey goven", "hey gobind"];
      const isWakeWordMatch = wakeWords.some(w => normalizedTranscript.includes(w));

      if (isWakeWordMatch) {
        if (confidence < threshold) {
          console.log("[VOICE] Wake word matched but confidence too low:", confidence, "<", threshold);
          return;
        }
        console.log("[VOICE] Wake word detected:", transcript, "Confidence:", confidence);
        window.dispatchEvent(new CustomEvent("govind:wake"));
        return;
      }

      // 🔴 EXIT / SLEEP COMMAND (Internal Runtime Logic)
      const exitWords = ["exit", "sleep", "go to sleep", "stop listening", "goodnight govind", "bye bye"];
      const isExitCommand = exitWords.some(w => normalizedTranscript === w);

      if (isExitCommand) {
        console.log("[VOICE] Exit command detected:", transcript);
        window.dispatchEvent(new CustomEvent("govind:sleep"));
        return;
      }

      // 🔒 GROUND TRUTH: Every user utterance ALWAYS enters chat log via this event
      window.dispatchEvent(
        new CustomEvent("govind:voice_event", {
          detail: {
            type: "TRANSCRIPT",
            text: transcript,
            timestamp: Date.now(),
          } as VoiceEvent,
        })
      );


      // 🔒 State-based gating for downstream processing (Intent Engine)
      if (!canAcceptVoice(getState())) {
        console.log("[VOICE] Input gated by state:", getState());
        return;
      }

      const now = Date.now();
      // 🔒 Duplicate guard (800ms)
      if (transcript === lastTranscript && now - lastTranscriptTime < 800) {
        return;
      }

      lastTranscript = transcript;
      lastTranscriptTime = now;

      console.log("[VOICE] Forwarding to Intent Engine:", transcript);
      handleIntent(transcript);

    } catch (err) {
      console.error("[VOICE] onresult handler failed", err);
    }
  };


  // 🚫 NOTE: onend and onerror are handled by voiceStateController.ts

  console.log("[VOICE] Voice lifecycle bound");
};


