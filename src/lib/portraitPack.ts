import type { BeardStyle, BuildStyle, HairColor, HairStyle, SkinTone } from "./playerLooks";
import { lookForPlayer, nameHash } from "./playerLooks";

type AgeBand = "young" | "mid" | "vet";

type Face = {
  id: string;
  hair: HairStyle[];
  hairColor: HairColor[];
  beard: BeardStyle[];
  skin: SkinTone[];
  age: AgeBand[];
  build?: BuildStyle;
};

const RELATED_HAIR: Record<HairStyle, HairStyle[]> = {
  short: ["crop", "buzz", "quiff"],
  quiff: ["short", "wavy"],
  shaggy: ["wavy", "fringe"],
  receding: ["short", "crop"],
  crop: ["buzz", "short"],
  fringe: ["short", "shaggy"],
  wavy: ["shaggy", "quiff"],
  buzz: ["crop", "short"],
};

export const PORTRAIT_FACES: Face[] = [
  { id: "sandy_quiff_none", hair: ["quiff"], hairColor: ["sandy", "fair"], beard: ["none"], skin: ["fair", "light"], age: ["young", "mid"] },
  { id: "sandy_quiff_stubble", hair: ["quiff"], hairColor: ["sandy", "fair"], beard: ["stubble"], skin: ["fair", "light", "warm"], age: ["young", "mid"] },
  { id: "fair_shaggy_none", hair: ["shaggy", "wavy"], hairColor: ["fair", "sandy"], beard: ["none"], skin: ["fair", "light"], age: ["young", "mid"] },
  { id: "fair_crop_none", hair: ["crop", "buzz", "short"], hairColor: ["fair", "sandy"], beard: ["none"], skin: ["fair"], age: ["young"] },
  { id: "auburn_short_none", hair: ["short", "crop"], hairColor: ["auburn"], beard: ["none"], skin: ["fair", "light"], age: ["young", "mid"] },
  { id: "auburn_shaggy_stubble", hair: ["shaggy", "wavy"], hairColor: ["auburn"], beard: ["stubble"], skin: ["fair", "light"], age: ["young", "mid"] },
  { id: "dark_short_none", hair: ["short"], hairColor: ["dark"], beard: ["none"], skin: ["light", "fair"], age: ["young", "mid"] },
  { id: "dark_short_none_b", hair: ["short"], hairColor: ["dark"], beard: ["none"], skin: ["light", "fair"], age: ["young", "mid"] },
  { id: "dark_short_none_c", hair: ["short"], hairColor: ["dark"], beard: ["none"], skin: ["light", "warm"], age: ["mid"] },
  { id: "dark_short_none_d", hair: ["short"], hairColor: ["dark"], beard: ["none"], skin: ["fair", "light"], age: ["young"] },
  { id: "dark_short_none_e", hair: ["short", "quiff"], hairColor: ["dark"], beard: ["none"], skin: ["light"], age: ["young", "mid"] },
  { id: "dark_short_none_broad", hair: ["short"], hairColor: ["dark"], beard: ["none"], skin: ["light"], age: ["mid"], build: "broad" },
  { id: "dark_short_stubble", hair: ["short"], hairColor: ["dark"], beard: ["stubble"], skin: ["light", "warm"], age: ["mid"] },
  { id: "dark_short_shadow", hair: ["short"], hairColor: ["dark"], beard: ["stubble", "none"], skin: ["light", "fair"], age: ["young", "mid"] },
  { id: "dark_short_beard", hair: ["short"], hairColor: ["dark"], beard: ["beard"], skin: ["fair", "light"], age: ["young", "mid"] },
  { id: "dark_crop_none", hair: ["crop", "buzz"], hairColor: ["dark"], beard: ["none"], skin: ["fair", "light"], age: ["young"] },
  { id: "dark_fringe_beard", hair: ["fringe"], hairColor: ["dark", "black"], beard: ["beard"], skin: ["light", "fair"], age: ["young", "mid"] },
  { id: "dark_wavy_none", hair: ["wavy"], hairColor: ["dark"], beard: ["none"], skin: ["warm", "tan"], age: ["young", "mid"] },
  { id: "dark_receding_stubble", hair: ["receding"], hairColor: ["dark", "black"], beard: ["stubble", "none"], skin: ["fair", "light"], age: ["mid", "vet"] },
  { id: "grey_receding_stubble", hair: ["receding", "short"], hairColor: ["dark", "black", "sandy"], beard: ["stubble", "none"], skin: ["fair", "light"], age: ["vet"] },
  { id: "black_short_none", hair: ["short"], hairColor: ["black"], beard: ["none"], skin: ["light", "fair"], age: ["young", "mid"] },
  { id: "black_buzz_beard", hair: ["buzz", "crop"], hairColor: ["black", "dark"], beard: ["beard"], skin: ["olive", "tan", "warm"], age: ["young", "mid"] },
  { id: "olive_short_beard", hair: ["short"], hairColor: ["dark", "black"], beard: ["beard"], skin: ["olive", "tan"], age: ["young", "mid"] },
];

function ageBand(age: number): AgeBand {
  if (age >= 35) return "vet";
  if (age >= 29) return "mid";
  return "young";
}

function scoreFace(face: Face, look: ReturnType<typeof lookForPlayer>, band: AgeBand): number {
  let score = 0;
  if (face.hair.includes(look.hair)) score += 10;
  else if (RELATED_HAIR[look.hair].includes(face.hair[0]!)) score += 3;
  if (face.hairColor.includes(look.hairColor)) score += 8;
  if (face.beard.includes(look.beard)) score += 7;
  if (face.skin.includes(look.skin)) score += 2;
  if (face.age.includes(band)) score += band === "vet" ? 12 : 4;
  else if (band === "vet") score -= 8;
  if (face.build && face.build === look.build) score += 2;
  return score;
}

export function portraitId(name: string, age: number): string {
  const look = lookForPlayer(name);
  const band = ageBand(age);
  const ranked = PORTRAIT_FACES.map((face) => ({ face, score: scoreFace(face, look, band) })).sort(
    (a, b) => b.score - a.score,
  );
  const best = ranked[0]!.score;
  const pool = ranked.filter((row) => row.score >= best - 5);
  return pool[nameHash(name) % pool.length]!.face.id;
}

export function portraitSrc(name: string, age: number): string {
  return `/portraits/${portraitId(name, age)}.jpg`;
}
