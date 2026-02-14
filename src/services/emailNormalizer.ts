// src/services/emailNormalizer.ts

const digitWords: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const letterRegex = /^[a-z]$/;

export const normalizeEmail = (spoken: string): string => {
  let text = spoken.toLowerCase();

  // Common misfires
  text = text
    .replace(/\bdot com\b/g, ".com")
    .replace(/\bdot net\b/g, ".net")
    .replace(/\bdot org\b/g, ".org")
    .replace(/\bspace\b/g, "") // passwords/emails often mis-hear space as a word
    .replace(/\bat rate\b/g, "@")
    .replace(/\bat the rate\b/g, "@");

  const tokens = text.split(" ");
  let result = "";

  for (const token of tokens) {
    // Digit words or actual digits
    if (digitWords[token]) {
      result += digitWords[token];
    } else if (token === "dot") {
      result += ".";
    } else if (token === "at" || token === "atrate") {
      result += "@";
    } else if (letterRegex.test(token)) {
      result += token;
    } else {
      result += token;
    }
  }

  // Final cleanup: remove all spaces and ensure @ and . are clean
  return result
    .replace(/\s+/g, "")
    .replace(/\.+/g, ".")
    .replace(/@+/g, "@");

};
