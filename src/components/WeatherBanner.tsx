import type { MatchClimate } from "../types";
import { climateSummary, halfWindBlurb } from "../lib/weather";

type Props = {
  climate: MatchClimate;
  period?: "first" | "second";
};

export function WeatherBanner({ climate, period }: Props) {
  return (
    <p className="weather-banner">
      {climateSummary(climate)}
      {period ? ` · ${halfWindBlurb(climate, period)}` : ""}
    </p>
  );
}
