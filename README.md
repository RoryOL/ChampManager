# ChampManager

Championship management for the **TUS Clare Senior Hurling Championship**.

The app is seeded with the 2026 Clare SHC field: 16 senior clubs in four groups of four, the completed group-stage scorelines, the quarter-final draw, and the relegation play-off pairings.

## What it does

- Tracks group tables with GAA scoring (a goal is worth three points)
- Applies Clare SHC tie-breakers: results between tied teams, then score difference, then scores for
- Records knockout and relegation results in goals and points
- Advances winners (and relegation losers) through the bracket automatically
- Shows championship squads scraped from numbered Clare Echo line-outs

Squads use the last published championship fifteen for each club, plus anyone named as a substitute in those reports. Line-outs are attributed to the original match report.

## 2026 reference groups

- **Group 1:** Ballyea, Inagh-Kilnamona, Clonlara, St Joseph's Doora-Barefield
- **Group 2:** Éire Óg, Crusheen, Scariff, Broadford
- **Group 3:** Clooney-Quin, Cratloe, Feakle, O'Callaghan's Mills
- **Group 4:** Kilmaley, Newmarket-on-Fergus, Wolfe Tones, Sixmilebridge

## Run locally

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

Results you enter are stored in the browser. Use **Reset 2026** to restore the published group-stage results and outstanding knockout ties.
