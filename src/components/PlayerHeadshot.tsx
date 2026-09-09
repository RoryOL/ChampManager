import type { PositionLine } from "../types";
import {
  eyeFill,
  hairFill,
  lookForPlayer,
  nameHash,
  skinFill,
  type HairStyle,
  type PlayerLook,
} from "../lib/playerLooks";

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
  const uid = `ph-${hash.toString(16)}`;
  const broad = look.build === "broad";
  const skin = skinFill(look.skin);
  const hair = hairFill(look.hairColor, age);
  const iris = eyeFill(look.eyes);
  const cx = 32;
  const headCy = 24.5;
  const headRx = broad ? 13.6 : 12.2;
  const headRy = 14.4;
  const jerseyY = 43;
  const bg = mix(colours.primary, "#121820", 0.72);

  return (
    <span className="player-headshot" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <title>{name}</title>
        <defs>
          <linearGradient id={`${uid}-skin`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={skin.light} />
            <stop offset="55%" stopColor={skin.base} />
            <stop offset="100%" stopColor={skin.shade} />
          </linearGradient>
          <linearGradient id={`${uid}-hair`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={hair.base} />
            <stop offset="100%" stopColor={hair.shade} />
          </linearGradient>
          <linearGradient id={`${uid}-kit`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={mix(colours.primary, "#ffffff", 0.16)} />
            <stop offset="100%" stopColor={mix(colours.primary, "#000000", 0.22)} />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <circle cx="32" cy="32" r="32" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-clip)`}>
          <circle cx="32" cy="32" r="32" fill={bg} />
          <path
            d={`M${broad ? 5 : 9} 64 L ${broad ? 11 : 13} ${jerseyY} Q 32 38 ${broad ? 53 : 51} ${jerseyY} L ${broad ? 59 : 55} 64 Z`}
            fill={`url(#${uid}-kit)`}
          />
          <path
            d={`M15 ${jerseyY + 1} L 49 ${jerseyY + 1} L 45 ${jerseyY + 8} L 19 ${jerseyY + 8} Z`}
            fill={colours.secondary}
          />
          {position === "GK" ? (
            <rect x="17" y={jerseyY + 12} width="30" height="5" rx="1.4" fill={colours.secondary} />
          ) : null}
          <path
            d={`M${cx - 4.6} ${headCy + headRy - 2} L ${cx - 4} ${jerseyY + 1} L ${cx + 4} ${jerseyY + 1} L ${cx + 4.6} ${headCy + headRy - 2} Z`}
            fill={`url(#${uid}-skin)`}
          />
          <ellipse cx={cx - headRx + 1.2} cy={headCy + 2} rx="2.4" ry="3.6" fill={`url(#${uid}-skin)`} />
          <ellipse cx={cx + headRx - 1.2} cy={headCy + 2} rx="2.4" ry="3.6" fill={`url(#${uid}-skin)`} />
          <path
            d={`M${cx - headRx} ${headCy}
               Q ${cx - headRx} ${headCy - headRy} ${cx} ${headCy - headRy}
               Q ${cx + headRx} ${headCy - headRy} ${cx + headRx} ${headCy}
               Q ${cx + headRx - 0.4} ${headCy + headRy - 2} ${cx} ${headCy + headRy}
               Q ${cx - headRx + 0.4} ${headCy + headRy - 2} ${cx - headRx} ${headCy} Z`}
            fill={`url(#${uid}-skin)`}
          />
          <ellipse cx={cx - 4.4} cy={headCy + 4} rx="3.2" ry="2.2" fill={skin.shade} opacity="0.28" />
          <ellipse cx={cx + 4.4} cy={headCy + 4} rx="3.2" ry="2.2" fill={skin.shade} opacity="0.28" />
          <Hair look={look} cx={cx} headCy={headCy} headRx={headRx} headRy={headRy} fill={`url(#${uid}-hair)`} />
          <Features
            look={look}
            cx={cx}
            headCy={headCy}
            iris={iris}
            brow={hair.shade}
            lip={mix(skin.shade, "#8a3a3a", 0.35)}
            beard={hair.base}
          />
        </g>
        <circle cx="32" cy="32" r="31" fill="none" stroke={colours.secondary} strokeWidth="2.2" />
      </svg>
    </span>
  );
}

function Features({
  look,
  cx,
  headCy,
  iris,
  brow,
  lip,
  beard,
}: {
  look: PlayerLook;
  cx: number;
  headCy: number;
  iris: string;
  brow: string;
  lip: string;
  beard: string;
}) {
  return (
    <g>
      <Eye cx={cx - 5.1} cy={headCy + 0.4} iris={iris} />
      <Eye cx={cx + 5.1} cy={headCy + 0.4} iris={iris} />
      <path d={`M${cx - 8} ${headCy - 3.4} Q ${cx - 5} ${headCy - 5.2} ${cx - 2.2} ${headCy - 3.2}`} fill={brow} />
      <path d={`M${cx + 8} ${headCy - 3.4} Q ${cx + 5} ${headCy - 5.2} ${cx + 2.2} ${headCy - 3.2}`} fill={brow} />
      <path
        d={`M${cx - 1.1} ${headCy + 1.6} L ${cx + 1.1} ${headCy + 1.6} L ${cx + 0.7} ${headCy + 5.4} Q ${cx} ${headCy + 6.4} ${cx - 0.7} ${headCy + 5.4} Z`}
        fill={lip}
        opacity="0.55"
      />
      <path d={`M${cx - 2.6} ${headCy + 8.4} Q ${cx} ${headCy + 10.2} ${cx + 2.6} ${headCy + 8.4}`} fill={lip} />
      {look.beard !== "none" ? (
        <path
          d={`M${cx - 8.4} ${headCy + 6.2} Q ${cx} ${headCy + 16} ${cx + 8.4} ${headCy + 6.2}
             Q ${cx} ${headCy + 8.6} ${cx - 8.4} ${headCy + 6.2}`}
          fill={beard}
          opacity={look.beard === "stubble" ? 0.55 : 0.92}
        />
      ) : null}
    </g>
  );
}

function Eye({ cx, cy, iris }: { cx: number; cy: number; iris: string }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="3.1" ry="2.1" fill="#f7f3ee" />
      <circle cx={cx} cy={cy + 0.15} r="1.45" fill={iris} />
      <circle cx={cx} cy={cy + 0.15} r="0.7" fill="#1a1410" />
      <circle cx={cx + 0.45} cy={cy - 0.45} r="0.45" fill="#ffffff" />
    </g>
  );
}

function Hair({
  look,
  cx,
  headCy,
  headRx,
  headRy,
  fill,
}: {
  look: PlayerLook;
  cx: number;
  headCy: number;
  headRx: number;
  headRy: number;
  fill: string;
}) {
  const top = headCy - headRy;
  const left = cx - headRx;
  const right = cx + headRx;
  const style: HairStyle = look.hair;

  if (style === "buzz") {
    return (
      <path
        d={`M${left + 1} ${headCy - 2} Q ${cx} ${top - 1} ${right - 1} ${headCy - 2}
           Q ${cx} ${top + 6} ${left + 1} ${headCy - 2}`}
        fill={fill}
      />
    );
  }
  if (style === "receding") {
    return (
      <path
        d={`M${left} ${headCy - 1} Q ${left + 2} ${top + 7} ${cx - 6} ${top + 8}
           H ${cx + 6} Q ${right - 2} ${top + 7} ${right} ${headCy - 1}
           Q ${cx} ${top + 5} ${left} ${headCy - 1}`}
        fill={fill}
      />
    );
  }
  if (style === "quiff") {
    return (
      <path
        d={`M${left} ${headCy}
           Q ${left + 2} ${top + 2} ${cx - 4} ${top + 1}
           Q ${cx + 2} ${top - 7} ${cx + 8} ${top + 2}
           Q ${right + 1} ${headCy - 2} ${right} ${headCy + 2}
           Q ${cx + 6} ${top + 8} ${cx} ${top + 6}
           Q ${cx - 8} ${top + 7} ${left} ${headCy}`}
        fill={fill}
      />
    );
  }
  if (style === "shaggy") {
    return (
      <path
        d={`M${left - 2.4} ${headCy + 4}
           Q ${left - 3} ${top + 2} ${cx} ${top - 2.4}
           Q ${right + 3} ${top + 2} ${right + 2.4} ${headCy + 4}
           Q ${cx + 8} ${top + 8} ${cx} ${top + 6}
           Q ${cx - 8} ${top + 8} ${left - 2.4} ${headCy + 4}`}
        fill={fill}
      />
    );
  }
  if (style === "fringe") {
    return (
      <path
        d={`M${left} ${headCy}
           Q ${cx} ${top - 3} ${right} ${headCy}
           Q ${cx + 10} ${top + 4} ${cx} ${top + 10}
           Q ${cx - 10} ${top + 4} ${left} ${headCy}`}
        fill={fill}
      />
    );
  }
  if (style === "wavy") {
    return (
      <path
        d={`M${left - 1} ${headCy + 1}
           Q ${left + 2} ${top - 1} ${cx - 6} ${top}
           Q ${cx} ${top - 5} ${cx + 6} ${top}
           Q ${right - 2} ${top - 1} ${right + 1} ${headCy + 1}
           Q ${cx} ${top + 7} ${left - 1} ${headCy + 1}`}
        fill={fill}
      />
    );
  }
  if (style === "crop") {
    return (
      <path
        d={`M${left + 0.5} ${headCy - 1} Q ${cx} ${top - 1.5} ${right - 0.5} ${headCy - 1}
           Q ${cx} ${top + 5} ${left + 0.5} ${headCy - 1}`}
        fill={fill}
      />
    );
  }
  return (
    <path
      d={`M${left - 0.6} ${headCy}
         Q ${cx} ${top - 3.2} ${right + 0.6} ${headCy}
         Q ${cx + 8} ${top + 6} ${cx} ${top + 5}
         Q ${cx - 8} ${top + 6} ${left - 0.6} ${headCy}`}
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
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.padEnd(6, "0");
  return [
    Number.parseInt(full.slice(0, 2), 16) || 20,
    Number.parseInt(full.slice(2, 4), 16) || 20,
    Number.parseInt(full.slice(4, 6), 16) || 20,
  ];
}
