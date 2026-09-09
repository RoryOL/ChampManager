import type { PositionLine } from "../types";
import { hairFill, lookForPlayer, nameHash, type PlayerLook } from "../lib/playerLooks";

type Colours = { primary: string; secondary: string };

type Props = {
  name: string;
  age: number;
  colours: Colours;
  position?: PositionLine;
  size?: number;
};

export function PlayerHeadshot({ name, age, colours, position, size = 40 }: Props) {
  const look = lookForPlayer(name);
  const hash = nameHash(name);
  const broad = look?.build === "broad";
  const headR = broad ? 13.5 : 12 + (hash % 3) * 0.4;
  const silhouette = !look;
  const skin = "#efc7a4";
  const shade = readableSilhouette(colours.primary);
  const hair = look ? hairFill(look.hairColor, age) : shade;
  const cx = 32;
  const headCy = 26;
  const neckTop = headCy + headR - 1;
  const jerseyY = 42;
  const bg = mix("#1b2433", colours.secondary, 0.22);

  return (
    <span className="player-headshot" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <title>{silhouette ? `${name} silhouette` : name}</title>
        <circle cx="32" cy="32" r="32" fill={bg} />
        <path
          d={`M${broad ? 6 : 9} 64 L ${broad ? 11 : 14} ${jerseyY} Q 32 38  ${broad ? 53 : 50} ${jerseyY} L ${broad ? 58 : 55} 64 Z`}
          fill={colours.primary}
        />
        <path
          d={`M14 ${jerseyY + 1} L 50 ${jerseyY + 1} L 46 ${jerseyY + 9} L 18 ${jerseyY + 9} Z`}
          fill={colours.secondary}
        />
        {position === "GK" ? (
          <rect x="16" y={jerseyY + 12} width="32" height="5" rx="1.5" fill={colours.secondary} />
        ) : null}
        <path
          d={`M${cx - 5} ${neckTop} L ${cx - 4.2} ${jerseyY + 2} L ${cx + 4.2} ${jerseyY + 2} L ${cx + 5} ${neckTop} Z`}
          fill={silhouette ? shade : skin}
        />
        <ellipse cx={cx} cy={headCy} rx={headR} ry={headR + 1.2} fill={silhouette ? shade : skin} />
        {look ? (
          <>
            <Hair look={look} cx={cx} headCy={headCy} headR={headR} fill={hair} />
            <g fill="#2c2118">
              <ellipse cx={cx - 5} cy={headCy + 1} rx="1.5" ry="1.8" />
              <ellipse cx={cx + 5} cy={headCy + 1} rx="1.5" ry="1.8" />
            </g>
            {look.beard === "stubble" ? (
              <path
                d={`M${cx - 7} ${headCy + 7} Q ${cx} ${headCy + 13} ${cx + 7} ${headCy + 7}`}
                fill={hair}
                opacity="0.75"
              />
            ) : null}
          </>
        ) : (
          <ellipse cx={cx} cy={headCy - 6} rx={headR + 0.4} ry={7.4} fill={shade} />
        )}
        <circle cx="32" cy="32" r="31" fill="none" stroke={colours.secondary} strokeWidth="2.4" />
      </svg>
    </span>
  );
}

function Hair({
  look,
  cx,
  headCy,
  headR,
  fill,
}: {
  look: PlayerLook;
  cx: number;
  headCy: number;
  headR: number;
  fill: string;
}) {
  const top = headCy - headR - 1;
  if (look.hair === "receding") {
    return (
      <path
        d={`M${cx - headR} ${headCy - 2} Q ${cx - headR + 1} ${top + 6} ${cx - 6} ${top + 8}
           H ${cx + 6} Q ${cx + headR - 1} ${top + 6} ${cx + headR} ${headCy - 2}
           Q ${cx} ${top + 4} ${cx - headR} ${headCy - 2}`}
        fill={fill}
      />
    );
  }
  if (look.hair === "quiff") {
    return (
      <path
        d={`M${cx - headR} ${headCy - 1} Q ${cx - 10} ${top - 2} ${cx - 2} ${top + 1}
           Q ${cx + 8} ${top - 6} ${cx + 9} ${top + 6}
           Q ${cx + headR + 1} ${headCy - 4} ${cx + headR} ${headCy + 1}
           Q ${cx} ${top + 3} ${cx - headR} ${headCy - 1}`}
        fill={fill}
      />
    );
  }
  if (look.hair === "shaggy") {
    return (
      <path
        d={`M${cx - headR - 2} ${headCy + 2} Q ${cx - 14} ${top - 1} ${cx} ${top - 2}
           Q ${cx + 14} ${top - 1} ${cx + headR + 2} ${headCy + 2}
           Q ${cx + 8} ${top + 6} ${cx} ${top + 5} Q ${cx - 8} ${top + 6} ${cx - headR - 2} ${headCy + 2}`}
        fill={fill}
      />
    );
  }
  return (
    <path
      d={`M${cx - headR - 0.5} ${headCy} Q ${cx} ${top - 3} ${cx + headR + 0.5} ${headCy}
         Q ${cx} ${top + 5} ${cx - headR - 0.5} ${headCy}`}
      fill={fill}
    />
  );
}

function readableSilhouette(primary: string): string {
  const [r, g, b] = parse(primary);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma < 80 ? "#3a4456" : mix(primary, "#1a1f28", 0.62);
}

function mix(hex: string, into: string, amount: number): string {
  const a = parse(hex);
  const b = parse(into);
  const t = Math.max(0, Math.min(1, amount));
  const ch = (i: number) => Math.round(a[i] * (1 - t) + b[i] * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function parse(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 20,
    Number.parseInt(full.slice(2, 4), 16) || 20,
    Number.parseInt(full.slice(4, 6), 16) || 20,
  ];
}
