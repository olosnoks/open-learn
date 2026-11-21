# Customizing your copy

This covers the things most schools and teams change: the look, the name, the domain, and the quizzes themselves. For how the game works internally see [architecture.md](architecture.md).

## Branding

### Colours

All colours are CSS variables in `src/index.css`, mapped to Tailwind class names in `tailwind.config.ts`. Change the variables and every component follows.

| Variable(s) | Used for |
| --- | --- |
| `--brand-50` to `--brand-900` | Primary green scale: buttons, host screen background, headings (Tailwind `brand-*`) |
| `--cream`, `--cream-100`, `--cream-200` | Page background and cards (`cream`, `cream-100`, `cream-200`) |
| `--ink`, `--ink-muted` | Body text and secondary text (`ink`, `ink-muted`) |
| `--answer-red`, `--answer-blue`, `--answer-yellow`, `--answer-green` | The four answer tiles (`answer-red` and so on) |
| `--success`, `--danger`, `--warning` | Status colours |

Team colours in team mode are separate: `TEAM_DEFS` in `worker/room/RoomDO.ts` (Red, Blue, Yellow, Green with hex values). They are sent to clients with the team, so changing them there is enough.

### Fonts

`index.html` loads **Inter** and **Space Grotesk** from Google Fonts. `tailwind.config.ts` sets `font-display` (headings) and `font-body`. To self-host or switch fonts, replace the `<link>` tags in `index.html` and the `fontFamily` entries in `tailwind.config.ts`; `src/index.css` also names the fonts on `body` and `h1` to `h3`.

### Shapes

`tailwind.config.ts` defines the tile corner radius (`rounded-tile`) and the pressed-button shadows (`shadow-tile`, `shadow-tile-pressed`).

### Name and title

The product name appears in these places; search for `Live Quiz` and `mscoding` to find them all:

- `index.html`: `<title>Live Quiz · mscoding.org</title>` (the browser tab title)
- `src/components/layout/HostShell.tsx`: header label on host pages
- `src/features/auth/AuthForm.tsx`: label on the login and register pages
- `src/features/player/JoinScreen.tsx`: heading on the join page

### Worker name

`name` in `wrangler.jsonc` (`live-quiz`) is the Worker's name and your default `*.workers.dev` hostname. If you change it, the Workers Builds project name must match (see [deploy-cloudflare.md](deploy-cloudflare.md)). Nothing in the code depends on it.

## Domain

Attach a custom domain to the Worker in the Cloudflare dashboard (Worker, Settings, Domains & Routes, Add, Custom Domain). The zone must be in the same Cloudflare account; Cloudflare creates the DNS record. Steps and caveats are in [deploy-cloudflare.md](deploy-cloudflare.md#6-custom-domain-optional). The app uses relative URLs and `location.host` for the WebSocket, so no code changes are needed for a new domain.

Players type the PIN at `/join`, or you can share `/join/<PIN>` directly, so a short domain is worth having.

## Making quizzes

### In the editor

Sign in and go to **Quizzes**, then **New quiz** (`/quizzes/new`). A quiz has a title (up to 120 characters), an optional description, and at least one question. For each question choose a type, write the prompt (up to 500 characters), set the time limit (5 to 240 seconds, default 20) and points (0 to 2000, default 1000), and fill in the type-specific fields: choices and which are correct, accepted spellings, puzzle order, slider range, image URL and pin position, and so on. All ten types are available in the editor; the table in [architecture.md](architecture.md#question-types) explains how each is scored.

Saving replaces the quiz's questions wholesale. Deleting a quiz also deletes its game history.

### From a spreadsheet

**Quizzes**, then **Import from spreadsheet** (`/quizzes/import`) accepts a `.csv`, `.tsv` or `.json` file, or rows pasted from Google Sheets or Excel. You get a preview with correct answers ticked and a list of skipped rows before anything is saved. The full format, with an example of every type, is in [importing-quizzes.md](importing-quizzes.md).

### The sample quiz

`quizzes/security-plus-practice-set-1.csv` is a ready-made set of ten multiple-choice CompTIA Security+ practice questions in the import format. Upload it as-is to try the game, or copy it as a template for your own sets. Put further ready-made quizzes in `quizzes/` so others who clone the repo can use them.

## Game modes

Chosen by the host when creating a room (`/host/create`):

| Mode | Scoring | Good for |
| --- | --- | --- |
| **Classic** | Correct answers score between 100 % (instant) and 50 % (at the buzzer) of the question's points | The usual competitive game |
| **Accuracy** | Correct answers score full points regardless of speed | Classes where you do not want to reward guessing fast |
| **Lecture** | Nothing is scored | Polls, check-for-understanding, slides between topics |

Polls, slides and scale questions never score in any mode.

## Team mode

Tick **Team mode** when creating the room and choose 2, 3 or 4 teams (Red, Blue, Yellow, Green). Players pick a team on the join screen before entering a nickname. Each player still answers individually and sees their own points; the team score is the sum of its members, and the standings and podium show teams instead of players. Each player also sees their own rank among everyone and their team's rank.

There is no balancing: players choose freely. For fair teams, assign them out loud before players join.

## Hosting tips

- Only the browser tab that clicked **Create room** can control the game (the host token lives in that tab's `sessionStorage`). Do not close it mid-game.
- The room reveals on its own when every connected player has answered, so a small group does not sit through the full timer.
- Players who lose connection or reload rejoin automatically with their score intact, as long as they use the same browser.
- Rooms hold up to 200 players.
- The history page (`/sessions`) keeps every finished game with a CSV of all answers (nickname, question, answer, latency, correct, points).

## Tunable constants

| What | Where |
| --- | --- |
| Max players per room (200) | `MAX_PLAYERS` in `worker/room/RoomDO.ts` |
| Time and points ranges | `UpsertQuizSchema` in `worker/api/quizzes.ts`, the number inputs in `src/features/quiz-editor/QuestionForm.tsx`, and the checks in `src/features/quiz-import/parseQuiz.ts` |
| Nickname length (20) | `JoinPayloadSchema` in `src/shared/schemas.ts` and `handleJoin` in `RoomDO.ts` |
| Login session length (30 days) | `SESSION_TTL_SEC` in `worker/api/auth.ts` |
| Password hashing cost | `PBKDF2_ITERATIONS` in `worker/auth/crypto.ts` (raise on a paid plan, max 100,000) |
| Team names and colours | `TEAM_DEFS` in `worker/room/RoomDO.ts` |

## Known gaps

- No password reset, email verification or login rate limiting. Before making registration public, add a Cloudflare rate limiting rule on `/api/auth/login` and `/api/auth/register`.
- Host control is tied to one browser tab (see above). There is no co-host.
- Deleting a quiz deletes its game history.
- `multi_select` has a `partialCredit` flag in its config, but scoring is all-or-nothing today.
- A `slider` question with no `correct` value is never scored as correct; use lecture mode or 0 points if it is meant as a survey.
- No fallback for networks that block WebSockets.
- Preview deployments are not supported (Durable Objects).

## Roadmap note on accounts

Account creation is planned to move to **Microsoft SSO (Entra ID)**. The email-and-password flow (`/register`, `/login`, `worker/auth/crypto.ts`) is a stopgap: do not invest in extending it (password reset, email verification, and so on). Quizzes and history are keyed by `users.id`, so the switch should not affect existing data.
