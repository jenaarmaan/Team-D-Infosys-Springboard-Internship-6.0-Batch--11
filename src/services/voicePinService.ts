// src/services/voicePinService.ts
import bcrypt from "bcryptjs";

const numberMap: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  too: "2",
  to: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

export interface VoicePinResult {
  pin: string | null;
  isValid: boolean;
}

export const parseVoicePin = (text: string): VoicePinResult => {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  let digits = "";

  for (const token of tokens) {
    if (numberMap[token]) {
      digits += numberMap[token];
    } else if (/^\d+$/.test(token)) {
      digits += token;
    }

    // ✅ CRITICAL FIX: STOP after 4 digits
    if (digits.length >= 4) {
      digits = digits.slice(0, 4);
      break;
    }
  }

  if (digits.length !== 4) {
    return { pin: null, isValid: false };
  }

  return { pin: digits, isValid: true };
};

// ... parseVoicePin logic ...

/**
 * Hash voice PIN before storing
 */
export const hashVoicePin = async (pin: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
};

/**
 * Verify voice PIN against stored hash
 */
export const verifyVoicePin = async (
  inputPin: string,
  storedHash: string
): Promise<boolean> => {
  return bcrypt.compare(inputPin, storedHash);
};
