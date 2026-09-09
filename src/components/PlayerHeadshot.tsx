import type { PositionLine } from "../types";
import { portraitSrc } from "../lib/portraitPack";

type Colours = { primary: string; secondary: string };

type Props = {
  name: string;
  age: number;
  colours: Colours;
  position?: PositionLine;
  size?: number;
};

export function PlayerHeadshot({ name, age, colours, position, size = 40 }: Props) {
  return (
    <span
      className={`player-headshot${position === "GK" ? " is-keeper" : ""}`}
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 2px ${colours.secondary}` }}
      aria-hidden="true"
      title={name}
    >
      <img src={portraitSrc(name, age)} alt="" width={size} height={size} />
    </span>
  );
}
