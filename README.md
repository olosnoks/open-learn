# Live Quiz · mscoding.org

A live, host-led quiz game: a React SPA plus a Cloudflare Worker, with one Durable Object per game room.

## Setup

```bash
npm install
echo "SESSION_SECRET=$(node -e "console.log(crypto.randomBytes(32).toString('hex'))")" > .dev.vars   # if .dev.vars is missing
npm run db:migrate     # applies drizzle/*.sql to the local D1
npm run dev            # Vite + Cloudflare plugin, emulating D1 and Durable Objects locally
```

Open <http://localhost:5173/register> to create a host account, then <http://localhost:5173/quizzes> to create a quiz. Then go to `/host/create` to start a room, and have players join at `/join`.

Local development works with the placeholder `database_id` in `wrangler.jsonc`. Before deploying:

```bash
npx wrangler d1 create quiz-db         # paste the returned id into wrangler.jsonc
npx wrangler secret put SESSION_SECRET  # paste a long random value (>= 32 chars)
npm run db:migrate:remote
npm run deploy
```

## Importing quizzes

Go to **Quizzes → Import from spreadsheet** (`/quizzes/import`). You can upload a `.csv`, `.tsv` or `.json` file, or paste rows copied from Google Sheets or Excel. The page has a **Download template** button.

| Column | Meaning |
| --- | --- |
| `question` | The question text (required) |
| `type` | Blank means multiple choice. Others: `multi`, `truefalse`, `type`, `poll`, `puzzle`, `slide` |
| `answer1` … `answer6` | The answers (for `puzzle`, in the correct order; for `type`, every accepted spelling) |
| `correct` | The answer **number**: `2`, or `1,3` when several are correct. A letter (`B`) or the answer text also works. Use `true`/`false` for true/false questions |
| `time` | Seconds (5–240, default 20) |
| `points` | 0–2000 (default 1000) |

You see a preview with the correct answers ticked before anything is saved. Rows with problems are listed with their spreadsheet row number and skipped. The parser is in `src/features/quiz-import/parseQuiz.ts`.

## Schema changes

Edit `worker/db/schema.ts`, then run `npm run db:generate`. That writes the next numbered migration into `drizzle/`, and `npm run db:migrate` applies it.

## Tests

```bash
npm test               # unit tests (Vitest)
npx playwright install chromium && npm run test:e2e   # starts the dev server itself (PORT=5174 to use another port)
```

On Windows, if every Vitest suite fails with `Cannot read properties of undefined (reading 'config')`, the shell's working directory has a lowercase drive letter (`c:\…`). `cd C:\path\to\repo` and run it again.

## Routes

| Path | Who | What |
| --- | --- | --- |
| `/quizzes`, `/quizzes/new`, `/quizzes/:id` | host | Quiz editor |
| `/host/create` | host | Pick a quiz and mode, then create a room |
| `/host/:sessionId/:code[/game]` | host | Lobby and live game controls |
| `/sessions`, `/sessions/:id` | host | History, results, CSV export |
| `/join[/:code]`, `/play/:code` | player | Join and play |
| `/login`, `/register` | host | Sign in / create a host account. Host routes redirect here when signed out |

## Auth

Hosts sign in with email + password (`/register`, `/login`). Players never sign in.

- **API:** `POST /api/auth/register` `{email, password, displayName}`, `POST /api/auth/login` `{email, password}`, `POST /api/auth/logout`, `GET /api/auth/me`. `/api/quizzes/*`, `/api/sessions/*` and `/api/auth/me` require a session (`requireAuth` in `worker/api/auth.ts`).
- **Passwords:** PBKDF2-SHA256 via WebCrypto, 16-byte random salt, stored in `users.password_hash` as `pbkdf2$<iterations>$<saltB64>$<hashB64>`. The iteration count is **30,000**. Workers caps PBKDF2 at 100k, and the Free plan gives 10 ms CPU per request. 100k measured ~12 ms on a fast desktop, so it would blow the budget on its own. 30k is ~3.5 ms, which leaves headroom for slower edge CPUs. That is well below OWASP's 600k recommendation; on a paid plan raise `PBKDF2_ITERATIONS` in `worker/auth/crypto.ts` (max 100k). Existing hashes keep working and are upgraded on the user's next login.
- **Sessions:** stateless HMAC-SHA256-signed cookie `session=v1.<base64url {u: userId, e: expiryMs}>.<base64url sig>`, `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 days`, plus `Secure` over https. The key is the `SESSION_SECRET` secret (`.dev.vars` locally, `npx wrangler secret put SESSION_SECRET` in production). If it is missing or shorter than 32 characters, auth endpoints return 500 and log why. Logout only clears the cookie; there is no server-side revocation. Rotating `SESSION_SECRET` signs everyone out.
- **CSRF:** non-GET `/api/*` requests with an `Origin` header that doesn't match the host are rejected with 403; `SameSite=Lax` covers the rest.
- The seeded `dev-user` row (password hash `!`) can't log in.
## Free-tier constraints

- Worker CPU: 10 ms per request, so keep the Worker thin.
- Durable Objects use the SQLite backend only (`new_sqlite_classes`).
- WebSocket Hibernation is required (`ctx.acceptWebSocket`). Per-socket identity lives in `serializeAttachment`, so it survives hibernation.
- Live answers stay in DO SQLite. D1 holds only quiz content, session summaries and per-answer export rows, all written once when the game ends.

## Known gaps

- No password reset, email verification or login rate limiting yet. Consider Cloudflare rate limiting rules on `/api/auth/login` before going public.
- Host control uses a per-room `hostToken` kept in `sessionStorage`. Only the tab that created the room can run the game.
- Deleting a quiz also deletes its game history (FK cascade).
