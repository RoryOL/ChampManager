import cors from "cors";
import express from "express";
import { getDb, load, save } from "./db.js";
import { computeStandings, generateFixtures, simulateMatch } from "./engine.js";
import type { Team } from "./types.js";

const PORT = Number(process.env.PORT ?? 3001);

load();

const app = express();
app.use(cors());
app.use(express.json());

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/teams", (_req, res) => {
  res.json(getDb().teams);
});

app.post("/api/teams", (req, res) => {
  const { name, attack, defense } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }
  const db = getDb();
  const id = slugify(name) || `team-${db.teams.length + 1}`;
  if (db.teams.some((t) => t.id === id)) {
    return res.status(409).json({ error: "A team with that name already exists" });
  }
  const team: Team = {
    id,
    name: name.trim(),
    attack: clamp(Number(attack) || 70),
    defense: clamp(Number(defense) || 70),
  };
  db.teams.push(team);
  // Roster changed, so any existing fixtures are stale.
  db.matches = [];
  save();
  res.status(201).json(team);
});

app.delete("/api/teams/:id", (req, res) => {
  const db = getDb();
  const before = db.teams.length;
  db.teams = db.teams.filter((t) => t.id !== req.params.id);
  if (db.teams.length === before) {
    return res.status(404).json({ error: "team not found" });
  }
  db.matches = [];
  save();
  res.status(204).end();
});

app.get("/api/matches", (_req, res) => {
  res.json(getDb().matches);
});

app.post("/api/season/generate", (_req, res) => {
  const db = getDb();
  if (db.teams.length < 2) {
    return res.status(400).json({ error: "Need at least 2 teams to generate fixtures" });
  }
  db.matches = generateFixtures(db.teams);
  save();
  res.status(201).json(db.matches);
});

app.post("/api/season/simulate", (_req, res) => {
  const db = getDb();
  if (db.matches.length === 0) {
    return res.status(400).json({ error: "No fixtures. Generate the season first." });
  }
  const teamsById = new Map(db.teams.map((t) => [t.id, t]));
  let simulated = 0;
  for (const match of db.matches) {
    if (match.played) continue;
    const home = teamsById.get(match.homeId);
    const away = teamsById.get(match.awayId);
    if (!home || !away) continue;
    const result = simulateMatch(home, away);
    match.homeGoals = result.homeGoals;
    match.awayGoals = result.awayGoals;
    match.played = true;
    simulated++;
  }
  save();
  res.json({ simulated, standings: computeStandings(db) });
});

app.post("/api/season/reset", (_req, res) => {
  const db = getDb();
  db.matches = [];
  save();
  res.status(204).end();
});

app.get("/api/standings", (_req, res) => {
  res.json(computeStandings(getDb()));
});

function clamp(n: number): number {
  return Math.max(1, Math.min(100, Math.round(n)));
}

app.listen(PORT, () => {
  console.log(`ChampManager API listening on http://localhost:${PORT}`);
});
