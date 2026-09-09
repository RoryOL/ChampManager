/**
 * Named Clare seniors keep a few known traits. Everyone else gets a stable
 * generated look from their name, so the panel is full of different faces.
 */
export type HairStyle = "short" | "quiff" | "shaggy" | "receding" | "crop" | "fringe" | "wavy" | "buzz";
export type HairColor = "sandy" | "fair" | "dark" | "black" | "auburn";
export type BeardStyle = "none" | "stubble" | "beard";
export type BuildStyle = "lean" | "broad";
export type SkinTone = "fair" | "light" | "warm" | "olive" | "tan";
export type EyeColor = "brown" | "blue" | "green" | "hazel";

export type PlayerLook = {
  hair: HairStyle;
  hairColor: HairColor;
  beard: BeardStyle;
  build: BuildStyle;
  skin: SkinTone;
  eyes: EyeColor;
};

const HAIR: HairStyle[] = ["short", "quiff", "shaggy", "receding", "crop", "fringe", "wavy", "buzz"];
const HAIR_COLOR: HairColor[] = ["dark", "dark", "black", "sandy", "fair", "auburn"];
const BEARD: BeardStyle[] = ["none", "none", "none", "stubble", "stubble", "beard"];
const BUILD: BuildStyle[] = ["lean", "lean", "lean", "broad"];
const SKIN: SkinTone[] = ["fair", "fair", "light", "light", "warm", "olive", "tan"];
const EYES: EyeColor[] = ["brown", "brown", "brown", "blue", "green", "hazel"];

const LOOKS: Record<string, Partial<PlayerLook>> = {
  "Tony Kelly": { hair: "quiff", hairColor: "sandy", beard: "none", build: "lean" },
  "Shane O'Donnell": { hair: "shaggy", hairColor: "fair", beard: "none", build: "lean" },
  "Peter Duggan": { hair: "short", hairColor: "dark", beard: "stubble", build: "broad" },
  "John Conlon": { hair: "receding", hairColor: "dark", beard: "stubble", build: "broad" },
  "David Fitzgerald": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Mark Rodgers": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Aidan McCarthy": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Diarmuid Ryan": { hair: "short", hairColor: "dark", beard: "stubble", build: "lean" },
  "Conor Cleary": { hair: "short", hairColor: "dark", beard: "stubble", build: "broad" },
  "Adam Hogan": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Eibhear Quilligan": { hair: "short", hairColor: "dark", beard: "none", build: "broad" },
  "David Reidy": { hair: "short", hairColor: "dark", beard: "stubble", build: "lean" },
  "Cathal Malone": { hair: "short", hairColor: "dark", beard: "stubble", build: "lean" },
  "Podge Collins": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Shane Woods": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Sean Rynne": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Diarmuid Stritch": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Niall O'Farrell": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Ryan Taylor": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Jack O'Neill": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Jamie Moylan": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Aidan Fawl": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Rory Hayes": { hair: "short", hairColor: "dark", beard: "stubble", build: "lean" },
  "Darragh Lohan": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Daithi Lohan": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Mark Sheedy": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Niall Deasy": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Ian Galvin": { hair: "short", hairColor: "dark", beard: "none", build: "lean" },
  "Aron Shanagher": { hair: "short", hairColor: "dark", beard: "stubble", build: "broad" },
};

export function generatedLook(name: string): PlayerLook {
  const hash = nameHash(name);
  const pick = <T,>(items: readonly T[], shift: number): T => items[(hash >>> shift) % items.length]!;
  return {
    hair: pick(HAIR, 0),
    hairColor: pick(HAIR_COLOR, 5),
    beard: pick(BEARD, 11),
    build: pick(BUILD, 16),
    skin: pick(SKIN, 20),
    eyes: pick(EYES, 24),
  };
}

export function lookForPlayer(name: string): PlayerLook {
  return { ...generatedLook(name), ...LOOKS[name] };
}

export function skinFill(tone: SkinTone): { base: string; shade: string; light: string } {
  switch (tone) {
    case "fair":
      return { base: "#f3d0b5", shade: "#d9aa86", light: "#fbe6d4" };
    case "light":
      return { base: "#e8b894", shade: "#c48d68", light: "#f3d2b6" };
    case "warm":
      return { base: "#d49a6c", shade: "#b0784c", light: "#e6b88a" };
    case "olive":
      return { base: "#c49262", shade: "#9d7048", light: "#d4ab7c" };
    default:
      return { base: "#b07850", shade: "#8a5a38", light: "#c9946e" };
  }
}

export function eyeFill(color: EyeColor): string {
  switch (color) {
    case "blue":
      return "#4d74a8";
    case "green":
      return "#4a7a52";
    case "hazel":
      return "#6e5a32";
    default:
      return "#5a3a22";
  }
}

export function hairFill(color: HairColor, age: number): { base: string; shade: string } {
  if (age >= 35) return { base: "#9a958c", shade: "#6f6c66" };
  switch (color) {
    case "sandy":
      return { base: "#c4a36a", shade: "#8d7044" };
    case "fair":
      return { base: "#d8b56c", shade: "#9c7e3e" };
    case "auburn":
      return { base: "#8a3e22", shade: "#5c2414" };
    case "black":
      return { base: "#1c1612", shade: "#0c0908" };
    default:
      return { base: "#3a2a1c", shade: "#1e1510" };
  }
}

export function nameHash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
