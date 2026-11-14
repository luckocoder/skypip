# Skypip

Skypip is a lightweight arcade browser game inspired by Flappy Bird, with a small world leaderboard and a zero-dependency Node.js backend.

## Features

- One-touch arcade gameplay with keyboard and touch support
- Pause, settings, sound controls, and replay flow
- Persistent leaderboard with weekly and all-time rankings
- First-visit username registration with case-insensitive uniqueness
- Server-side score validation and anti-abuse token checks
- Static frontend served from a small Node HTTP server

## Project structure

- `index.html` — game shell and UI
- `css/` — styles
- `js/` — game logic, input, audio, UI, world rendering
- `server.js` — HTTP server and leaderboard API
- `functions/` — Cloudflare Pages API handlers
- `migrations/` — Cloudflare D1 database schema
- `data/` — persistent leaderboard storage

## Prerequisites

- Node.js 18 or newer

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Deploy for free with Cloudflare Pages

The Cloudflare Pages version serves the game as static files and runs the leaderboard API as Pages Functions, with player data in D1.

1. Create a D1 database named `skypip` in the Cloudflare dashboard.
2. Before deploying this version, run the migrations in order from `migrations/`. If `0001_init.sql` was already applied for an existing deployment, run only `0002_unique_usernames.sql` once.
3. Create a Pages project from this GitHub repository. Set the build command to `npm run build` and the output directory to `dist`.
4. In the Pages project's **Settings → Functions → D1 database bindings**, add a binding named `DB` and select the `skypip` database.
5. Add a secret environment variable named `LEADERBOARD_SECRET` for the production environment. Generate a value locally with:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

6. Deploy the project and open the URL Cloudflare provides.

Cloudflare's Workers Free plan has daily request and database quotas. Check the current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) before launch. The Pages Functions API requires the `DB` binding and `LEADERBOARD_SECRET`; without them, leaderboard requests will return an error.

The D1 database starts empty; local scores in `data/scores.json` are not imported automatically. The `LEADERBOARD_SECRET` in Cloudflare is separate from the key used by the local Node server.
The username migration reserves names without adding zero-score entries to the ranking. Existing duplicate names are changed to a unique `Pip` name based on the player's ID.

## Environment variables

You can customize the app with the following variables:

- `PORT` — server port (default: `3000`)
- `DATA_DIR` — directory used for stored leaderboard data (default: `./data`)
- `ALLOW_ORIGIN` — CORS origin allowed to call the API (default: `*`)
- `TRUST_PROXY=1` — trust `X-Forwarded-For` when running behind a proxy
- `LEADERBOARD_SECRET` — secret used to sign run tokens; if not set, one is generated automatically and stored in `DATA_DIR`

Example:

```bash
PORT=3000
DATA_DIR=./data
ALLOW_ORIGIN=http://localhost:3000
LEADERBOARD_SECRET=change-me
npm start
```

## API

The backend exposes a small JSON API:

### `GET /api/health`
Returns server health and number of stored players.

### `POST /api/session`
Creates a new run token for a game session.

Response example:

```json
{ "token": "1700000000000.abc123..." }
```

### `POST /api/scores`
Submits a score for a player.

Request body:

```json
{
  "playerId": "A1B2C3D4E5F6G7H8",
  "name": "Player One",
  "score": 42,
  "token": "1700000000000.abc123..."
}
```

Response example:

```json
{
  "ok": true,
  "best": 42,
  "weekBest": 42,
  "improved": true,
  "rank": { "all": 12, "week": 4 }
}
```

### `GET /api/scores?board=all|week&limit=50&player=ID`
Returns leaderboard data for the selected board.

### `POST /api/name`
Claims or updates a unique player name. Names are saved in the browser after the API confirms the claim.

## Notes

- The leaderboard data file is stored in JSON format under `data/scores.json`.
- The Cloudflare deployment stores leaderboard data in D1 instead.
- The server validates the score against a minimum run time to reduce fake submissions.
- This project is intentionally lightweight and has no external dependencies.

## License

This project is provided as-is for local development and demonstration purposes.
