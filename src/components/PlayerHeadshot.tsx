import { createAvatar } from "@dicebear/core";
import * as adventurer from "@dicebear/adventurer";
import { useMemo } from "react";
import type { PositionLine } from "../types";
import { hairFill, lookForPlayer, portraitHair, skinFill } from "../lib/playerLooks";

type Colours = { primary: string; secondary: string };

type Props = {
  name: string;
  age: number;
  colours: Colours;
  position?: PositionLine;
  size?: number;
};

function hex(value: string): string {
  return value.replace("#", "").slice(0, 6);
}

export function PlayerHeadshot({ name, age, colours, position, size = 40 }: Props) {
  const look = lookForPlayer(name);
  const skin = skinFill(look.skin);
  const hair = hairFill(look.hairColor, age);
  const svg = useMemo(
    () =>
      createAvatar(adventurer, {
        seed: name,
        size: 64,
        radius: 50,
        backgroundColor: [hex(mix(colours.primary, "#121820", 0.45))],
        skinColor: [hex(skin.base)],
        hairColor: [hex(hair.base)],
        hair: portraitHair(look.hair),
        glassesProbability: 0,
        earringsProbability: 0,
        features: look.beard === "none" ? [] : ["mustache"],
        featuresProbability: look.beard === "none" ? 0 : 100,
      }).toString(),
    [name, look.hair, look.beard, skin.base, hair.base, colours.primary],
  );

  return (
    <span
      className={`player-headshot${position === "GK" ? " is-keeper" : ""}`}
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 2px ${colours.secondary}` }}
      aria-hidden="true"
      title={name}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function mix(from: string, into: string, amount: number): string {
  const a = parse(from);
  const b = parse(into);
  const t = Math.max(0, Math.min(1, amount));
  const ch = (i: number) => Math.round(a[i] * (1 - t) + b[i] * t)
    .toString(16)
    .padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parse(value: string): [number, number, number] {
  const raw = value.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
  return [
    Number.parseInt(full.slice(0, 2), 16) || 20,
    Number.parseInt(full.slice(2, 4), 16) || 20,
    Number.parseInt(full.slice(4, 6), 16) || 20,
  ];
}
