import type { RatingsContext, SquadBalance } from "../types";

export type { RatingsContext, SquadBalance };

export const DEFAULT_BALANCE: SquadBalance = "standard";
export const LEGACY_BALANCE: SquadBalance = "standard";

export const BALANCE_OPTIONS: {
  value: SquadBalance;
  title: string;
  subtitle: string;
  copy: string;
}[] = [
  {
    value: "standard",
    title: "Standard",
    subtitle: "Lineups and grades",
    copy: "Panels follow the usual algorithm — newspaper line-outs, a handful of known names, and a bit of guesswork. The stronger clubs stay favourites.",
  },
  {
    value: "balanced",
    title: "Balanced",
    subtitle: "Even championship",
    copy: "Every club is nudged toward the same shout at the Canon. Strong panels come down a little, weaker ones come up. Stars stay the best lads on their own team. Computer clubs start from the same plan so the groups stay open.",
  },
];

export function migrateBalance(raw: unknown): SquadBalance {
  return raw === "balanced" ? "balanced" : LEGACY_BALANCE;
}

export function balanceTitle(balance: SquadBalance): string {
  return BALANCE_OPTIONS.find((option) => option.value === balance)?.title ?? "Standard";
}

export function balanceCopy(balance: SquadBalance): string {
  return BALANCE_OPTIONS.find((option) => option.value === balance)?.copy ?? "";
}

export function parseRatings(ctx?: number | RatingsContext | null): {
  seed: number | undefined;
  balance: SquadBalance;
} {
  if (ctx == null) return { seed: undefined, balance: "standard" };
  if (typeof ctx === "number") return { seed: ctx, balance: "standard" };
  return { seed: ctx.seed, balance: migrateBalance(ctx.balance) };
}

export function ratingsCtx(seed: number | undefined, balance?: SquadBalance): RatingsContext {
  return { seed, balance };
}
