export const isAuthOnlyAllowed = (text: string) => {
  const allowed = [
    "yes",
    "no",
    "repeat",
    "back",
    "cancel",
    "exit",
  ];

  return allowed.some((w) => text.includes(w));
};