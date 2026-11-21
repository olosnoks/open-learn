# OpenLearn

A live, host-led quiz game in the style of Kahoot: the host projects a question, players answer on their phones, and the leaderboard updates after every round. It runs on Cloudflare's free tier (Workers, Durable Objects, D1), so a school or a team can run its own copy at no cost.

![Screenshot placeholder: host screen during a question](docs/images/screenshot.png)
<!-- TODO: add docs/images/screenshot.png -->

## Features

- Rooms with a 6-digit PIN, up to 200 players each
- Ten question types: multiple choice, multi-select, true/false, type answer, puzzle (ordering), poll, slide, slider, drop pin, scale
- Three game modes: **classic** (faster answers score more), **accuracy** (correct is full points), **lecture** (no scores)
- Team mode with 2 to 4 colour teams
- Quiz editor, plus import from CSV, TSV or JSON (paste straight from Google Sheets or Excel)
- Host controls: pause, resume, reveal early, kick, end; the room reveals automatically when everyone has answered
- Players rejoin after a dropped connection or page reload and keep their score
- Game history with a per-answer CSV export
- Host accounts with email and password; players never sign in. Set a `REGISTRATION_CODE` secret to make sign-up invite-only

## Recent additions

- **Game options** when starting a room: shuffle questions, shuffle answers, answers on phones or shapes only, random nicknames, auto-advance
- **Kahoot-style screens**: coloured shape tiles, QR code in the lobby, projector host view with answer distribution and scoreboard, staged final podium
- **Question images** by URL, in the editor and the importer (`image` column)
- **Editor**: reorder, duplicate and delete questions, time and points quick picks, duplicate quiz, unsaved-changes guard
- **Answer streak bonus** in classic mode (+100 per consecutive correct answer, capped at +500)
- **Reports**: per-question accuracy with difficult questions flagged, per-player accuracy with "needs help", team breakdown, CSV exports

## Run it locally in 5 minutes

You need Node 20 or newer. Everything runs on your machine: D1 and Durable Objects are emulated by the Cloudflare Vite plugin, no Cloudflare account required.

```bash
git clone <your-fork-url> open-learn
cd open-learn
npm ci
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" > .dev.vars
npm run db:migrate     # applies drizzle/*.sql to the local D1
npm run dev            # http://localhost:5173
```

1. Open <http://localhost:5173/register> and create a host account.
2. Go to **Quizzes** and either build a quiz or **Import from spreadsheet** and upload `quizzes/security-plus-practice-set-1.csv`.
3. **Start a game** (`/host/create`), pick the quiz and a mode, then **Create room**.
4. In a second browser window (a private window works), open <http://localhost:5173/join>, type the PIN and a nickname.

Details, tests and how to reset local state: [docs/local-development.md](docs/local-development.md).

## Deploy your own on Cloudflare (free)

The short version (full walkthrough with dashboard screens, secrets, custom domain and troubleshooting in [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md)):

```bash
npx wrangler login
npx wrangler d1 create quiz-db          # paste the returned id into database_id in wrangler.jsonc, commit
npm run db:migrate:remote               # create the tables in your new D1
```

Then in the Cloudflare dashboard: **Workers & Pages → Create application → GitHub**, pick your repo, set the project name to `live-quiz` (it must equal `name` in `wrangler.jsonc`), build command `npm run build`, keep the default deploy command, turn Preview builds off, deploy. Finally set the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET
```

After that, every push to `main` redeploys.

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/local-development.md](docs/local-development.md) | Prerequisites, `.dev.vars`, tests, how D1 and Durable Objects are emulated, resetting state |
| [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) | Step-by-step Cloudflare deployment, secrets, custom domain, day-two operations, limits, troubleshooting |
| [docs/architecture.md](docs/architecture.md) | Diagram, request and WebSocket flow, what lives in the Durable Object vs D1, phases, scoring, auth design, adding a question type |
| [docs/customizing.md](docs/customizing.md) | Branding, domain, making quizzes, game modes, team mode, known gaps and roadmap |
| [docs/importing-quizzes.md](docs/importing-quizzes.md) | The spreadsheet and JSON import formats with an example of every question type |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch, test, pull request |

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/quizzes`, `/quizzes/new`, `/quizzes/:id` | host | Quiz list and editor |
| `/quizzes/import` | host | Import from CSV, TSV or JSON |
| `/host/create` | host | Pick a quiz and mode, then create a room |
| `/host/:sessionId/:code[/game]` | host | Lobby and live game controls |
| `/sessions`, `/sessions/:id` | host | History, results, CSV export |
| `/join[/:code]`, `/play/:code` | player | Join and play |
| `/login`, `/register` | host | Sign in or create a host account; host routes redirect here when signed out |
| `/api/*`, `/ws/room/:code` | both | JSON API and the per-room WebSocket (see [architecture](docs/architecture.md)) |

## Auth in brief

Hosts sign in with email and password; players never sign in. Passwords are hashed with PBKDF2-SHA256 (30,000 iterations, chosen to fit the free plan's 10 ms CPU budget). Sessions are stateless HMAC-signed cookies keyed by the `SESSION_SECRET` secret; if it is missing or shorter than 32 characters, auth endpoints return 500 and log why. Non-GET `/api/*` requests from a different origin are rejected. Full details and the reasoning: [docs/architecture.md](docs/architecture.md#auth-design).

**Roadmap note:** account creation is planned to move to Microsoft SSO (Entra ID). Treat the password flow as temporary and do not build on it.

## Free-tier constraints that shape the code

- Worker CPU is 10 ms per request on the free plan, so the Worker stays thin and the password hash iteration count is capped.
- Durable Objects use the SQLite backend only (`new_sqlite_classes` in `wrangler.jsonc`).
- WebSocket Hibernation is required (`ctx.acceptWebSocket`). Per-socket identity lives in `serializeAttachment`, so it survives hibernation.
- Live answers stay in the room's own SQLite. D1 holds quiz content, session summaries and per-answer export rows, written once when a game ends.

## Known gaps

- No password reset, email verification or login rate limiting. Add a Cloudflare rate limiting rule on `/api/auth/login` before opening registration to the public.
- Host control uses a per-room `hostToken` kept in `sessionStorage`; only the tab that created the room can run the game.
- Deleting a quiz also deletes its game history (foreign key cascade).
- No fallback when WebSockets are blocked (some school and corporate proxies).

## License

License: not yet chosen.
