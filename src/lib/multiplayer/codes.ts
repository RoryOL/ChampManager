const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function normaliseCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
