/**
 * Run many championships to compare Standard vs Balanced panels.
 *
 *   npm run sim:championship
 */
import { seedChampionship } from "../src/data/championship";
import { compactName } from "../src/lib/display";
import { printXvTable, tallyChampions } from "../src/lib/championshipSim";
import type { SquadBalance } from "../src/types";

const SEASONS = Number(process.env.SIM_SEASONS ?? 48);
const seeds = Array.from({ length: SEASONS }, (_, index) => 1000 + index * 17);

function report(label: SquadBalance, counts: Record<string, number>): void {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const ranked = seedChampionship.teams
    .map((team) => ({ team, n: counts[team.id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.team.name.localeCompare(b.team.name));
  const winners = ranked.filter((row) => row.n > 0).length;
  console.log(`\n${label} — ${total} seasons, ${winners} different champions`);
  for (const row of ranked) {
    const pct = total ? ((100 * row.n) / total).toFixed(1) : "0.0";
    const bar = "#".repeat(Math.round((row.n / Math.max(total, 1)) * 40));
    console.log(`  ${compactName(row.team).padEnd(22)} ${String(row.n).padStart(3)}  ${pct.padStart(5)}%  ${bar}`);
  }
}

console.log(`Simulating ${SEASONS} championships per mode (no preseason, default line-outs).`);
console.log("\nStandard XV means (seed 1000)");
printXvTable(1000, "standard");
console.log("\nBalanced XV means (seed 1000)");
printXvTable(1000, "balanced");

const standard = tallyChampions(seeds, "standard");
const balanced = tallyChampions(seeds, "balanced");
report("standard", standard);
report("balanced", balanced);
