# Local development

Everything runs on your machine. The Cloudflare Vite plugin starts the Worker in `workerd` (the same runtime Cloudflare uses) next to Vite, and emulates D1 and Durable Objects on local disk. No Cloudflare account is needed until you deploy.

## Prerequisites

- **Node 20 or newer** (this guide was checked with Node 24 and npm 11).
- Git.
- For end-to-end tests only: Chromium via Playwright (installed below).

## First run

```bash
git clone <your-fork-url> live-quiz
cd live-quiz
npm ci
```

Create `.dev.vars` in the project root. It holds local secrets and is ignored by git:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" > .dev.vars
```

The file is one line, `SESSION_SECRET=<64 hex characters>`. Any value of at least 32 characters works; the auth endpoints return 500 without it.

Create the local database tables and start the dev server:

```bash
npm run db:migrate     # wrangler d1 migrations apply quiz-db --local
npm run dev            # vite, with the Cloudflare plugin
```

Open <http://localhost:5173>. Register a host account at `/register`, make a quiz at `/quizzes/new` (or import `quizzes/security-plus-practice-set-1.csv` at `/quizzes/import`), start a room at `/host/create`, and join as a player from a second browser window at `/join`.

The `database_id` already in `wrangler.jsonc` does not matter locally: the local D1 is keyed by the database name and lives on your disk.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload for the React app and the Worker, on <http://localhost:5173> |
| `npm run build` | Production build into `dist/` (`dist/client` for the site, `dist/live_quiz` for the Worker) |
| `npm run preview` | Build, then serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` over `src`, `worker`, `tests` and the config files |
| `npm test` | Unit tests with Vitest (`tests/unit/**/*.test.ts`) |
| `npm run test:e2e` | Playwright end-to-end tests (`tests/e2e/*.spec.ts`); starts the dev server itself |
| `npm run db:generate` | Generate a new SQL migration in `drizzle/` from `worker/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the **local** D1 |
| `npm run db:migrate:remote` | Apply migrations to the **production** D1 (see [deploy-cloudflare.md](deploy-cloudflare.md)) |
| `npm run deploy` | Build and deploy with Wrangler from your machine |

## Tests

The three checks, in the order they are cheapest to run:

```bash
npm run typecheck
npm test
npx playwright install chromium && npm run test:e2e
```

- **Unit tests** cover the pure modules: answer evaluation and ranking (`worker/room/machine.ts`), scoring, room codes, password hashing and session tokens, the quiz parser, and the player standing helpers. They run in plain Node in about a second; `vitest.config.ts` is separate from `vite.config.ts` so they do not boot `workerd`.
- **End-to-end tests** register real host accounts through the UI and API, create quizzes, import a spreadsheet, and play a two-team game with two player pages. `playwright.config.ts` starts `npm run dev` on port 5173 if nothing is listening there. To run against another port, set `PORT` (PowerShell: `$env:PORT='5174'; npm run test:e2e`; bash: `PORT=5174 npm run test:e2e`). Note that `reuseExistingServer` is on: if anything is already listening on the chosen port (for example a dev server from another checkout), the tests run against **that** server and its database, so pick a free port when in doubt.

E2E tests write to your local D1 (new users and quizzes with `e2e` in their names). Reset the state (below) if that bothers you.

**Windows:** if every Vitest suite fails with `Cannot read properties of undefined (reading 'config')`, your shell's working directory has a lowercase drive letter (`c:\...`). Run `cd C:\path\to\repo` with an uppercase `C:` and try again.

## How the local emulation works

- **Worker**: the Cloudflare Vite plugin (`@cloudflare/vite-plugin` in `vite.config.ts`) reads `wrangler.jsonc` and runs `worker/index.ts` in `workerd` through Miniflare. Requests to `/api/*` and `/ws/*` go to the Worker (`run_worker_first` in `wrangler.jsonc`); everything else is served by Vite as the SPA. Same origin, same port, so WebSockets work with no proxy configuration.
- **D1**: an SQLite file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. `npm run db:migrate` runs the SQL in `drizzle/` against it. The seeded `dev-user` row from `0001_seed_dev_user.sql` cannot log in (its password hash is `!`); it exists only so foreign keys are satisfied in scaffolding scripts.
- **Durable Objects**: each room (`RoomDO`) gets its own SQLite storage under `.wrangler/state/v3/do/` the first time a room with that code is created. Alarms (the question timer) and WebSocket Hibernation are emulated too, so the game behaves as in production, just on one machine.
- **Secrets and vars**: `SESSION_SECRET` comes from `.dev.vars`; `ENVIRONMENT` comes from `vars` in `wrangler.jsonc`.

## Where state lives and how to reset it

| Path | Contents |
| --- | --- |
| `.wrangler/state/v3/d1/` | Local D1 (users, quizzes, sessions) |
| `.wrangler/state/v3/do/` | Local Durable Object storage, one directory per room |
| `.wrangler/state/v3/cache/` | Miniflare cache |
| `.wrangler/deploy/config.json` | Written by `npm run build`; tells Wrangler to deploy from `dist/live_quiz` |
| `dist/` | Build output |
| Browser `localStorage` key `live-quiz:player` | The player's identity for reconnecting to a room |
| Browser `sessionStorage` key `hostToken` | The host token for the room created in that tab |

To start from scratch, stop the dev server and delete the state directory, then re-create the tables:

```bash
# bash / Git Bash
rm -rf .wrangler/state && npm run db:migrate
```

```powershell
# PowerShell
Remove-Item -Recurse -Force .wrangler\state; npm run db:migrate
```

Deleting `.wrangler` entirely is also fine; `npm run build` recreates `.wrangler/deploy`.

## Changing the database schema

1. Edit `worker/db/schema.ts` (drizzle table definitions).
2. `npm run db:generate` writes the next numbered file into `drizzle/` with a random suffix such as `0002_even_proudstar.sql`, and updates `drizzle/meta/`. The random name is fine; if you rename the file, update the matching `tag` in `drizzle/meta/_journal.json`.
3. `npm run db:migrate` applies it locally.
4. Commit `worker/db/schema.ts` and the whole `drizzle/` directory together.

The room's own tables (players, teams, answers, room_state) are not part of drizzle. They are created by `RoomDO`'s constructor in `worker/room/RoomDO.ts` with `CREATE TABLE IF NOT EXISTS`, and column additions are done in place there (see the `disconnected_at` example).

## Project layout

```
index.html              SPA entry (title, fonts)
src/                    React app
  App.tsx               routes
  features/             auth, host, player, quiz-editor, quiz-import, results
  components/           game, layout and ui components
  shared/               zod schemas and TypeScript types shared with the Worker
  lib/                  api client, WebSocket hook, storage helpers
worker/                 Cloudflare Worker (Hono)
  index.ts              routes, WebSocket upgrade, static assets
  api/                  auth, quizzes, sessions
  auth/crypto.ts        PBKDF2 and HMAC helpers
  db/                   drizzle schema and client
  room/                 RoomDO (Durable Object), game rules, scoring, room codes
drizzle/                D1 migrations
quizzes/                sample quiz CSVs
tests/unit, tests/e2e   Vitest and Playwright tests
wrangler.jsonc          Worker name, bindings, Durable Object migrations
```
