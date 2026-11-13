# Skypip

Skypip is a lightweight arcade browser game inspired by Flappy Bird, with a small world leaderboard and a zero-dependency Node.js backend.

## Features

- One-touch arcade gameplay with keyboard and touch support
- Pause, settings, sound controls, and replay flow
- Persistent leaderboard with weekly and all-time rankings
- Server-side score validation and anti-abuse token checks
- Static frontend served from a small Node HTTP server

## Project structure

- `index.html` — game shell and UI
- `css/` — styles
- `js/` — game logic, input, audio, UI, world rendering
- `server.js` — HTTP server and leaderboard API
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
Updates a player name.

## Notes

- The leaderboard data file is stored in JSON format under `data/scores.json`.
- The server validates the score against a minimum run time to reduce fake submissions.
- This project is intentionally lightweight and has no external dependencies.

## License

This project is provided as-is for local development and demonstration purposes.
