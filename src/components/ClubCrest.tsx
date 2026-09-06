import type { Team } from "../types";

type Size = "sm" | "md" | "lg";

type Props = {
  team?: Team;
  size?: Size;
};

const DIM: Record<Size, number> = { sm: 22, md: 36, lg: 56 };

const SHIELD =
  "M32 3.2 L57.5 13.2 V33.2 C57.5 47.2 45.8 56.6 32 61.4 C18.2 56.6 6.5 47.2 6.5 33.2 V13.2 Z";

function ink(hex: string): string {
  const value = hex.replace("#", "");
  const n = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma > 150 ? "#102033" : "#f4f4f0";
}

function Field({ primary, secondary, layout }: { primary: string; secondary: string; layout: string }) {
  switch (layout) {
    case "fess":
      return (
        <>
          <rect x="0" y="0" width="64" height="32" fill={primary} />
          <rect x="0" y="32" width="64" height="32" fill={secondary} />
        </>
      );
    case "pale":
      return (
        <>
          <rect x="0" y="0" width="32" height="64" fill={primary} />
          <rect x="32" y="0" width="32" height="64" fill={secondary} />
        </>
      );
    case "bend":
      return (
        <>
          <rect width="64" height="64" fill={primary} />
          <polygon points="0,0 64,64 64,0" fill={secondary} />
        </>
      );
    case "quarter":
      return (
        <>
          <rect x="0" y="0" width="32" height="32" fill={primary} />
          <rect x="32" y="0" width="32" height="32" fill={secondary} />
          <rect x="0" y="32" width="32" height="32" fill={secondary} />
          <rect x="32" y="32" width="32" height="32" fill={primary} />
        </>
      );
    case "chevron":
      return (
        <>
          <rect width="64" height="64" fill={secondary} />
          <polygon points="8,58 32,18 56,58" fill={primary} />
        </>
      );
    case "hoops":
      return (
        <>
          <rect width="64" height="64" fill={primary} />
          <rect x="0" y="16" width="64" height="10" fill={secondary} />
          <rect x="0" y="38" width="64" height="10" fill={secondary} />
        </>
      );
    case "saltire":
      return (
        <>
          <rect width="64" height="64" fill={primary} />
          <polygon points="32,6 58,32 32,58 6,32" fill={secondary} />
        </>
      );
    default:
      return (
        <>
          <rect width="64" height="64" fill={primary} />
          <rect x="0" y="34" width="64" height="30" fill={secondary} />
        </>
      );
  }
}

function Emblem({ id, primary, secondary }: { id: string; primary: string; secondary: string }) {
  const light = ink(primary) === "#f4f4f0" ? primary : secondary;
  const dark = ink(primary) === "#102033" ? primary : secondary;
  const stroke = ink(dark);

  switch (id) {
    case "ballyea":
      return (
        <g fill={stroke} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round">
          <ellipse cx="32" cy="30" rx="9" ry="12" fill={light} />
          <path d="M24 24 C20 18 24 12 32 14 C40 12 44 18 40 24" fill={dark} />
          <rect x="30" y="40" width="4" height="10" rx="1" />
        </g>
      );
    case "inagh-kilnamona":
      return (
        <g fill={dark}>
          <polygon points="14,44 24,22 32,36 40,20 50,44" />
          <rect x="12" y="44" width="40" height="4" fill={stroke} />
        </g>
      );
    case "clonlara":
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 28 C22 18, 42 38, 52 28" />
          <path d="M12 36 C22 26, 42 46, 52 36" />
        </g>
      );
    case "st-josephs":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.4">
          <rect x="28" y="16" width="8" height="32" rx="1" />
          <rect x="18" y="24" width="28" height="8" rx="1" />
        </g>
      );
    case "eire-og":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.2">
          <circle cx="32" cy="28" r="10" />
          <polygon points="32,14 35,24 32,22 29,24" />
        </g>
      );
    case "crusheen":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.3">
          <rect x="29" y="16" width="6" height="30" />
          <rect x="20" y="22" width="24" height="6" />
          <circle cx="32" cy="20" r="4" />
        </g>
      );
    case "scariff":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.4">
          <path d="M12 38 C20 28, 44 28, 52 38 L48 46 C40 40, 24 40, 16 46 Z" />
        </g>
      );
    case "broadford":
      return (
        <g fill="none" stroke={dark} strokeWidth="2.2" strokeLinecap="round">
          <path d="M10 40 C22 28, 42 48, 54 36" />
          <path d="M18 46 L46 22" />
        </g>
      );
    case "clooney-quin":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.3">
          <rect x="18" y="34" width="28" height="12" rx="1" />
          <polygon points="16,34 32,18 48,34" />
        </g>
      );
    case "cratloe":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.2">
          <polygon points="32,14 48,40 16,40" />
          <rect x="29" y="40" width="6" height="10" />
        </g>
      );
    case "feakle":
      return (
        <g fill={dark} stroke={stroke} strokeWidth="1.2">
          <polygon points="32,14 38,28 32,50 26,28" />
          <circle cx="32" cy="24" r="4" fill={light} />
        </g>
      );
    case "ocallaghans-mills":
      return (
        <g fill="none" stroke={dark} strokeWidth="2">
          <circle cx="32" cy="32" r="12" />
          <path d="M32 20 V44 M20 32 H44 M23 23 L41 41 M41 23 L23 41" />
        </g>
      );
    case "kilmaley":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.3">
          <rect x="20" y="28" width="24" height="18" />
          <polygon points="18,28 32,14 46,28" />
          <rect x="29" y="36" width="6" height="10" fill={dark} />
        </g>
      );
    case "newmarket":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.3">
          <ellipse cx="32" cy="34" rx="14" ry="8" />
          <path d="M20 30 L18 22 H22 L24 28" fill={dark} />
          <circle cx="24" cy="40" r="3" fill={dark} />
          <circle cx="40" cy="40" r="3" fill={dark} />
        </g>
      );
    case "wolfe-tones":
      return (
        <g fill={light} stroke={dark} strokeWidth="1.3">
          <ellipse cx="32" cy="34" rx="12" ry="9" />
          <polygon points="22,28 18,18 26,24" />
          <polygon points="42,28 46,18 38,24" />
          <circle cx="28" cy="32" r="1.6" fill={dark} />
          <circle cx="36" cy="32" r="1.6" fill={dark} />
        </g>
      );
    case "sixmilebridge":
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
          <path d="M10 40 H54" />
          <path d="M16 40 V28 H24 V40" />
          <path d="M40 40 V28 H48 V40" />
          <path d="M16 28 Q32 16 48 28" />
        </g>
      );
    default:
      return (
        <g fill={light} stroke={dark} strokeWidth="1.4">
          <circle cx="32" cy="32" r="10" />
        </g>
      );
  }
}

const LAYOUT: Record<string, string> = {
  ballyea: "pale",
  "inagh-kilnamona": "fess",
  clonlara: "bend",
  "st-josephs": "quarter",
  "eire-og": "hoops",
  crusheen: "pale",
  scariff: "fess",
  broadford: "chevron",
  "clooney-quin": "pale",
  cratloe: "hoops",
  feakle: "saltire",
  "ocallaghans-mills": "quarter",
  kilmaley: "fess",
  newmarket: "bend",
  "wolfe-tones": "pale",
  sixmilebridge: "fess",
};

export function ClubCrest({ team, size = "sm" }: Props) {
  const dim = DIM[size];
  const primary = team?.colours.primary ?? "#1a3d7c";
  const secondary = team?.colours.secondary ?? "#e8c547";
  const id = team?.id ?? "club";
  const clipId = `crest-clip-${id}-${size}`;

  return (
    <svg
      className={`club-crest club-crest--${size}`}
      width={dim}
      height={dim}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <Field primary={primary} secondary={secondary} layout={LAYOUT[id] ?? "fess"} />
        <Emblem id={id} primary={primary} secondary={secondary} />
      </g>
      <path d={SHIELD} fill="none" stroke="rgba(8,12,18,0.85)" strokeWidth="2.4" />
      <path d={SHIELD} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
    </svg>
  );
}
