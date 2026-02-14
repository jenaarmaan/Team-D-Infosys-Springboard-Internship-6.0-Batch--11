import React from "react";
import { normalizeEmail } from "@/services/emailNormalizer";
import { parseVoicePin } from "@/services/voicePinService";
import { RegisterStep, LoginStep } from "./authTypes";

/* ================= REGISTRATION SESSION ================= */

export interface RegistrationSession {
  email: string;
  password?: string;
  appPassword?: string;
  voicePin?: string;
  faceImage?: File;
}

/* ================= SPEECH HANDLERS (SP1) ================= */

/**
 * VOICE-FIRST REGISTRATION STATE MACHINE
 */
export const handleRegisterSpeech = (
  text: string,
  session: RegistrationSession,
  setSession: React.Dispatch<React.SetStateAction<RegistrationSession>>,
  step: RegisterStep,
  setStep: (step: RegisterStep) => void,
  speak: (msg: string) => void
): void => {
  const normalizedText = text.toLowerCase().trim();

  // 👂 GLOBAL CONFIRMATION HANDLING
  if (step.startsWith("CONFIRM_")) {
    const isYes = normalizedText.includes("yes") || normalizedText.includes("correct") || normalizedText.includes("yeah");
    const isNo = normalizedText.includes("no") || normalizedText.includes("incorrect") || normalizedText.includes("wrong");

    if (isYes) {
      if (step === "CONFIRM_EMAIL") {
        setStep("PASSWORD");
        speak("Great. Now, please say your password.");
      } else if (step === "CONFIRM_PASSWORD") {
        setStep("APP_PASSWORD");
        speak("Got it. Now please say your Google App Password for Gmail integration.");
      } else if (step === "CONFIRM_APP_PASSWORD") {
        setStep("FACE");
        speak("Got it. Now I need to capture your face. Please look at the camera and click Capture Face.");
      } else if (step === "CONFIRM_VOICE_PIN") {
        setStep("COMPLETE");
        speak("Finalizing your secure registration.");
      }
      return;
    }

    if (isNo) {
      if (step === "CONFIRM_EMAIL") {
        setStep("EMAIL");
        speak("My apologies. Please say your email again.");
      } else if (step === "CONFIRM_PASSWORD") {
        setStep("PASSWORD");
        speak("No problem. Please say your password again.");
      } else if (step === "CONFIRM_APP_PASSWORD") {
        setStep("APP_PASSWORD");
        speak("Understood. Please say your App Password again.");
      } else if (step === "CONFIRM_VOICE_PIN") {
        setStep("VOICE_PIN");
        speak("Please say your four digit voice PIN again.");
      }
      return;
    }

    speak("I didn't catch that. Please say yes to confirm or no to try again.");
    return;
  }

  // ✍️ CAPTURE STEPS
  switch (step) {
    case "EMAIL": {
      const email = normalizeEmail(text);
      if (!email || !email.includes("@")) {
        speak("That does not sound like a valid email. Please say it again.");
        return;
      }
      setSession((prev) => ({ ...prev, email }));
      setStep("CONFIRM_EMAIL");
      speak(`Email set to ${email}. Is that correct?`);
      return;
    }

    case "PASSWORD": {
      setSession((prev) => ({ ...prev, password: text }));
      setStep("CONFIRM_PASSWORD");
      speak(`I captured your password. You said: ${text}. Is that correct?`);
      return;
    }

    case "APP_PASSWORD": {
      // App passwords usually have spaces, remove them for storage
      const cleanAppPwd = text.replace(/\s/g, "");
      setSession((prev) => ({ ...prev, appPassword: cleanAppPwd }));
      setStep("CONFIRM_APP_PASSWORD");
      speak(`App Password received: ${text}. Is that correct?`);
      return;
    }

    case "VOICE_PIN": {
      const result = parseVoicePin(text);
      if (!result.isValid || !result.pin) {
        speak("That does not sound like a four digit PIN. Please say each digit clearly, like 1 2 3 4.");
        return;
      }

      setSession((prev) => ({ ...prev, voicePin: result.pin }));
      setStep("CONFIRM_VOICE_PIN");
      speak(`I heard your PIN as ${result.pin.split("").join(" ")}. Is that correct?`);
      return;
    }


    case "FACE":
      // Camera service advances this via govind:face event
      return;

    default:
      return;
  }
};

/**
 * VOICE-FIRST LOGIN STATE MACHINE
 */
export const handleLoginSpeech = (
  text: string,
  step: LoginStep,
  setStep: (step: LoginStep) => void,
  speak: (msg: string) => void,
  loginDataRef: React.MutableRefObject<any>
): void => {
  switch (step) {
    case "EMAIL": {
      const email = normalizeEmail(text);
      if (!email || !email.includes("@")) {
        speak("That does not sound like a valid email. Please say it again.");
        return;
      }
      loginDataRef.current.email = email;
      setStep("PASSWORD");
      speak(`Email set to ${email}. Now, please say your password.`);
      return;
    }

    case "PASSWORD": {
      loginDataRef.current.password = text;
      setStep("FACE");
      speak("Password captured. Looking for your face now.");
      return;
    }

    case "FACE":
      return;

    case "VOICE_PIN": {
      const result = parseVoicePin(text);
      if (!result.isValid || !result.pin) {
        speak("Invalid PIN. Please say your four digit voice PIN.");
        return;
      }
      loginDataRef.current.spokenPin = result.pin;
      setStep("SUCCESS");
      return;
    }


  }
};
