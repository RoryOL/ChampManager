import type { MatchClimate } from "../types";
import { climateSummary, halfWindBlurb, skyLabel, windStrengthLabel, type WindSides } from "../lib/weather";

type Props = {
  climate: MatchClimate;
  period?: "first" | "second";
  firstName: string;
  secondName: string;
};

export function WeatherBanner({ climate, period, firstName, secondName }: Props) {
  const sides: WindSides = { first: firstName, second: secondName };
  return (
    <p className="weather-banner">
      {period
        ? `${skyLabel(climate.sky)} · ${windStrengthLabel(climate.windStrength)}. ${halfWindBlurb(climate, period, sides)}`
        : climateSummary(climate, sides)}
    </p>
  );
}
