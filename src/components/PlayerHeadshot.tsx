import type { PositionLine } from "../types";
import { hairFill, lookForPlayer, nameHash } from "../lib/playerLooks";

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
  const headW = look?.build === "broad" ? 22 : 19 + (hash % 3);
  const shoulder = look?.build === "broad" ? 56 : 50 + (hash % 5);
  const silhouette = !look;
  const skin = "#efc7a4";
  const shade = silhouette ? mix(colours.primary, "#141414", 0.72) : "#2a221c";
  const hair = look ? hairFill(look.hairColor, age) : shade;
  const cx = 32;
  const headTop = 10;
  const headR = headW / 2;
  const jerseyY = 46;

  return (
    <span className="player-headshot" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <title>{silhouette ? `${name} silhouette` : name}</title>
        <circle cx="32" cy="32" r="31" fill={colours.secondary} />
        <circle cx="32" cy="32" r="31" fill={colours.primary} fillOpacity="0.22" />
        <path
          d={`M${32 - shoulder / 2} 64 Q ${32 - shoulder / 2} ${jerseyY + 2} ${cx - 9} ${jerseyY}
             L ${cx - 6} 40 L ${cx + 6} 40 L ${cx + 9} ${jerseyY}
             Q ${32 + shoulder / 2} ${jerseyY + 2} ${32 + shoulder / 2} 64 Z`}
          fill={colours.primary}
        />
        <path
          d={`M${cx - 10} ${jerseyY} L ${cx + 10} ${jerseyY} L ${cx + 7} ${jerseyY + 7} L ${cx - 7} ${jerseyY + 7} Z`}
          fill={colours.secondary}
        />
        {position === "GK" ? (
          <rect x={cx - 14} y={jerseyY + 10} width="28" height="5" rx="1.5" fill={colours.secondary} />
        ) : null}
        <rect x={cx - 4} y="38" width="8" height="8" rx="2" fill={silhouette ? shade : skin} />
        <ellipse cx={cx} cy={headTop + headR + 4} rx={headR} ry={headR + 1.5} fill={silhouette ? shade : skin} />
        {look ? (
          <Hair look={look} cx={cx} headTop={headTop} headR={headR} fill={hair} />
        ) : (
          <ellipse cx={cx} cy={headTop + 6} rx={headR + 0.6} ry={7} fill={shade} />
        )}
        {!silhouette && look ? (
          <g fill="#2c2118" opacity="0.85">
            <ellipse cx={cx - 5} cy={headTop + headR + 3} rx="1.3" ry="1.6" />
            <ellipse cx={cx + 5} cy={headTop + headR + 3} rx="1.3" ry="1.6" />
            {look.beard === "stubble" ? (
              <path
                d={`M${cx - 7} ${headTop + headR + 10} Q ${cx} ${headTop + headR + 16} ${cx + 7} ${headTop + headR + 10}`}
                fill={hair}
                opacity="0.7"
              />
            ) : null}
          </g>
        ) : null}
      </svg>
    </span>
  );
}

function Hair({
  look,
  cx,
  headTop,
  headR,
  fill,
}: {
  look: NonNullable<ReturnType<typeof lookForPlayer>>;
  cx: number;
  headTop: number;
  headR: number;
  fill: string;
}) {
  if (look.hair === "receding") {
    return (
      <path
        d={`M${cx - headR} ${headTop + 10} Q ${cx - headR + 2} ${headTop + 2} ${cx - 6} ${headTop + 6}
           H ${cx + 6} Q ${cx + headR - 2} ${headTop + 2} ${cx + headR} ${headTop + 10}
           Q ${cx} ${headTop + 4} ${cx - headR} ${headTop + 10}`}
        fill={fill}
      />
    );
  }
  if (look.hair === "quiff") {
    return (
      <>
        <path
          d={`M${cx - headR} ${headTop + 12} Q ${cx - 8} ${headTop - 1} ${cx} ${headTop + 2}
             Q ${cx + 10} ${headTop - 4} ${cx + 7} ${headTop + 8}
             Q ${cx + headR} ${headTop + 6} ${cx + headR} ${headTop + 14}
             Q ${cx} ${headTop + 4} ${cx - headR} ${headTop + 12}`}
          fill={fill}
        />
      </>
    );
  }
  if (look.hair === "shaggy") {
    return (
      <path
        d={`M${cx - headR - 1} ${headTop + 14} Q ${cx - 12} ${headTop - 2} ${cx} ${headTop}
           Q ${cx + 12} ${headTop - 2} ${cx + headR + 1} ${headTop + 14}
           Q ${cx + 8} ${headTop + 6} ${cx} ${headTop + 5} Q ${cx - 8} ${headTop + 6} ${cx - headR - 1} ${headTop + 14}`}
        fill={fill}
      />
    );
  }
  return (
    <path
      d={`M${cx - headR} ${headTop + 11} Q ${cx} ${headTop - 2} ${cx + headR} ${headTop + 11}
         Q ${cx} ${headTop + 5} ${cx - headR} ${headTop + 11}`}
      fill={fill}
    />
  );
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
