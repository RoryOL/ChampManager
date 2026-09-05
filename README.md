# ChampManager

A football championship manager. Build your league, simulate a full
double round-robin season, and watch the standings shake out.

## Stack

- **Server** (`server/`) — Express + TypeScript REST API with a JSON-backed
  data store and a Poisson-based match simulation engine.
- **Client** (`client/`) — Vite + React + TypeScript UI: league table, squad
  management, and fixtures/results.

The two run as npm workspaces.

## Getting started

```bash
npm install     # install all workspace dependencies
npm run dev      # start API (:3001) and client (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api` to the
Express server on port 3001.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and client together (used by the Cloud Agent `dev` terminal). |
| `npm run build` | Type-check and build both workspaces. |
| `npm run typecheck` | Type-check both workspaces without emitting. |
| `npm start` | Run the built API server. |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `GET` | `/api/teams` | List clubs. |
| `POST` | `/api/teams` | Add a club (`name`, `attack`, `defense`). |
| `DELETE` | `/api/teams/:id` | Remove a club. |
| `GET` | `/api/matches` | List fixtures/results. |
| `POST` | `/api/season/generate` | Build double round-robin fixtures. |
| `POST` | `/api/season/simulate` | Simulate all unplayed matches. |
| `POST` | `/api/season/reset` | Clear results. |
| `GET` | `/api/standings` | Computed league table. |

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm ci` and runs
`npm run dev` in a persistent `dev` terminal, exposing ports 5173 (client)
and 3001 (API).
