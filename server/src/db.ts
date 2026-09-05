import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database, Team } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const DATA_FILE = resolve(DATA_DIR, "db.json");

const SEED_TEAMS: Team[] = [
  { id: "arsenal", name: "Arsenal", attack: 84, defense: 80 },
  { id: "city", name: "Manchester City", attack: 90, defense: 82 },
  { id: "liverpool", name: "Liverpool", attack: 87, defense: 79 },
  { id: "spurs", name: "Tottenham", attack: 80, defense: 72 },
  { id: "chelsea", name: "Chelsea", attack: 78, defense: 76 },
  { id: "united", name: "Manchester United", attack: 77, defense: 74 },
];

let db: Database = { teams: [], matches: [] };

function seed(): Database {
  return { teams: SEED_TEAMS.map((t) => ({ ...t })), matches: [] };
}

export function load(): void {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, "utf-8");
      db = JSON.parse(raw) as Database;
      if (!Array.isArray(db.teams) || !Array.isArray(db.matches)) {
        db = seed();
        save();
      }
    } else {
      db = seed();
      save();
    }
  } catch {
    db = seed();
    save();
  }
}

export function save(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export function getDb(): Database {
  return db;
}
