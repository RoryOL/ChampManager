/**
 * Stylized looks for Clare seniors with public match-report coverage.
 * Everyone else renders as a kit-coloured silhouette.
 */
export type HairStyle = "short" | "quiff" | "shaggy" | "receding";
export type HairColor = "sandy" | "fair" | "dark" | "black" | "auburn";
export type BeardStyle = "none" | "stubble";
export type BuildStyle = "lean" | "broad";

export type PlayerLook = {
  hair: HairStyle;
  hairColor: HairColor;
  beard: BeardStyle;
  build: BuildStyle;
};

const LOOKS: Record<string, PlayerLook> = {
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

export function lookForPlayer(name: string): PlayerLook | null {
  return LOOKS[name] ?? null;
}

export function hairFill(color: HairColor, age: number): string {
  if (age >= 35) return "#9a958c";
  switch (color) {
    case "sandy":
      return "#c4a36a";
    case "fair":
      return "#d8b56c";
    case "auburn":
      return "#8a3e22";
    case "black":
      return "#1a1410";
    default:
      return "#3a2a1c";
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
