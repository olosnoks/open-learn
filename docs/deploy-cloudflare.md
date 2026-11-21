# Deploy your own copy on Cloudflare

This walks through deploying OpenLearn to your own Cloudflare account using Workers Builds (Cloudflare builds and deploys from your GitHub repository on every push). Everything fits in the free plan. The sequence below was run end to end against this repository's configuration.

You need:

- A GitHub account and a Cloudflare account (free).
- Node 20 or newer on your machine, for the one-off setup commands.

Placeholders used below: `<your-github-user>`, `<database-id>`, `<your-domain>`.

## 1. Get the code into your own GitHub repository

Fork this repository on GitHub, or clone it and push to a new repository you own:

```bash
git clone <original-repo-url> open-learn
cd open-learn
git remote set-url origin https://github.com/<your-github-user>/open-learn.git
git push -u origin main
```

Install dependencies so the `npm run` and `npx wrangler` commands below work:

```bash
npm ci
```

## 2. Create the D1 database

```bash
npx wrangler login            # opens a browser, authorizes the Wrangler CLI
npx wrangler d1 create quiz-db
```

The output contains a `database_id`. Open `wrangler.jsonc` and replace the existing id with yours:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "quiz-db",
    "database_id": "<database-id>",
    "migrations_dir": "drizzle"
  }
]
```

Commit and push:

```bash
git add wrangler.jsonc
git commit -m "Use my D1 database"
git push
```

## 3. Create the tables

Run the migrations against the remote database from your machine:

```bash
npm run db:migrate:remote
```

This applies every file in `drizzle/` (`0000_init.sql`, `0001_seed_dev_user.sql`, `0002_...sql`) and prints a table of what ran.

Why from your machine: the token Workers Builds generates for itself has no D1 permission, so migrations cannot run as part of the build. Run them locally **before** pushing code that depends on them.

## 4. Connect the repository in the Cloudflare dashboard

1. Open the Cloudflare dashboard, go to **Workers & Pages**, click **Create application**.
2. Choose the **GitHub** tab (import a repository). Authorize the Cloudflare GitHub app for your account or organization when asked, then pick your `open-learn` repository.
3. **Project name:** `live-quiz`. This **must equal** `name` in `wrangler.jsonc`. If you want a different Worker name, change both.
4. **Build command:** `npm run build`
5. **Deploy command:** leave the default, `npx wrangler deploy`. The Cloudflare Vite plugin writes `dist/live_quiz/wrangler.json` plus a redirect file in `.wrangler/deploy/`, so Wrangler deploys the built Worker from `dist/live_quiz` and the static site from `dist/client` without any extra flags.
6. **Preview builds:** turn **off**. Preview URLs do not work for Workers with Durable Objects.
7. **Protect with Cloudflare Access:** leave **off**. Players must be able to reach the site without signing in to anything.
8. Click **Deploy** (or Save and Deploy). The first build takes a couple of minutes.

When the build finishes you get a `https://live-quiz.<your-subdomain>.workers.dev` URL. The site loads, but signing in and registering return **500** until the next step.

## 5. Set the session secret

`SESSION_SECRET` signs the host login cookie. It must be at least 32 characters; the auth endpoints refuse to run without it. Either generate one and pipe it straight into Wrangler:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET
```

or set it in the dashboard: your Worker, **Settings**, **Variables & Secrets**, **Add**, type **Secret**, name `SESSION_SECRET`, paste a long random value.

Either way the change is live within seconds. Open `/register` on your URL and create the first host account.

### Step 6: close registration to strangers

Hosts are the only users who can write to your database (quizzes, questions, game history), so once you have your own account, require an invite code for further sign-ups:

```bash
npx wrangler secret put REGISTRATION_CODE   # paste any phrase you will hand to colleagues
```

From then on the register page shows an **Invite code** field and `POST /api/auth/register` answers 403 without the right code. Existing accounts are unaffected. To reopen registration, delete the secret with `npx wrangler secret delete REGISTRATION_CODE`. Locally, leave it out of `.dev.vars` to keep sign-up open, or add it there to test the flow.

Consider also adding a Cloudflare **rate limiting rule** (one is included on the free plan) for `/api/auth/*`, for example 10 requests per minute per IP, to slow down password guessing.

## 6. Custom domain (optional)

The domain's DNS zone must be in the **same Cloudflare account** as the Worker.

1. Your Worker, **Settings**, **Domains & Routes**, **Add**, **Custom Domain**.
2. Enter `quiz.<your-domain>` (or the bare domain) and confirm.

Cloudflare creates the DNS record and certificate for you; no manual DNS steps. The `workers.dev` URL keeps working alongside it unless you disable it on the same page.

## Day two

### Every push to `main` redeploys

Workers Builds watches the production branch (`main`). Each push runs `npm run build` and `npx wrangler deploy`. Watch progress under your Worker's **Deployments** (or **Builds**) tab. A failed build leaves the previous deployment running.

To deploy by hand from your machine instead (for example if Builds is misconfigured):

```bash
npm run deploy      # vite build && wrangler deploy
```

### Schema changes

The D1 schema is defined in `worker/db/schema.ts`. After editing it:

```bash
npm run db:generate          # writes drizzle/000N_<name>.sql
npm run db:migrate           # apply locally and test
npm run db:migrate:remote    # apply to production
git add drizzle worker/db/schema.ts && git commit -m "..." && git push
```

Run `db:migrate:remote` **before** pushing the code that needs the new columns; the build cannot run migrations for you (see step 3). Each migration file is applied once and recorded, so running the command twice is safe.

### Rotating `SESSION_SECRET`

Run the same command as in step 5 with a new value. Every existing login cookie stops verifying immediately, so **all hosts are signed out** and must log in again. Passwords and quizzes are unaffected. Do this if the secret may have leaked, or after removing someone's access to the Cloudflare account.

### Monitoring

`observability` is enabled in `wrangler.jsonc`, so your Worker's **Logs** tab shows request logs and `console.error` output (including the "SESSION_SECRET is not set" message and any failed D1 summary writes from the room).

### Free-tier limits that matter

Numbers are Cloudflare's published free-plan limits at the time of writing; check their pricing pages for current values.

| Resource | Free limit | What it means for a quiz |
| --- | --- | --- |
| Workers requests | 100,000 per day | Page loads, API calls and WebSocket upgrades. A 30-player, 20-question game is a few hundred requests. |
| Workers CPU | 10 ms per request | Why PBKDF2 is capped at 30,000 iterations and the Worker stays thin. |
| Durable Objects | Shares the daily request budget; incoming WebSocket messages are counted at a reduced rate under Hibernation | Each answer is one message. A classroom game is a few thousand messages. |
| D1 | 5 million rows read per day, 100,000 rows written per day, 5 GB | Quiz content and history. One finished game writes one session row plus one row per answer. |
| Workers Builds | 3,000 build minutes per month, 1 concurrent build | A build is about 1 to 2 minutes, so roughly 1,500 pushes a month. |

### Cost expectations

A school running several games a day stays at **zero**. The daily request limit is the one to watch: it is shared by the site, the API and every WebSocket connection, and it resets every day (UTC). If you hit it, players see errors until the reset.

### When you outgrow it

- **Workers Paid** (about USD 5 per month at the time of writing) raises the request budget to millions per month and the CPU limit to 30 ms, with the same code. After upgrading, raise `PBKDF2_ITERATIONS` in `worker/auth/crypto.ts` (maximum 100,000); existing accounts are upgraded on their next login.
- D1 and Durable Objects have paid tiers with much higher daily limits; nothing in the code changes.
- Many concurrent rooms are fine: each room is its own Durable Object and does not share state with others.

## Troubleshooting

**Build fails complaining the Worker name does not match.** The project name you entered in the dashboard differs from `name` in `wrangler.jsonc` (`live-quiz`). Make them identical: either rename the project (Worker, Settings) or change `name` in `wrangler.jsonc` and push.

**`/api/auth/register` or `/login` returns 500, "server misconfigured".** `SESSION_SECRET` is missing or shorter than 32 characters. Set it (step 5). The Worker's **Logs** show the exact reason.

**Vitest fails every suite with `Cannot read properties of undefined (reading 'config')` on Windows.** The shell's working directory has a lowercase drive letter (`c:\...`). Run `cd C:\path\to\repo` with an uppercase drive letter and try again.

**Players see "Room not found" or the Worker returns 409 "Room not initialized".** The WebSocket connected to a room code that has no game behind it: a typo in the PIN, a room from a game that has already ended (ending a game clears the room's storage), or a room created on a different deployment or database than the one the player is hitting. Create a new room and share the new PIN.

**Host sees "No host token in this tab".** Only the browser tab that clicked **Create room** holds the host token (it is in `sessionStorage`). Go back to `/host/create` in that tab, or create a new room.

**WebSocket never connects behind a school or corporate proxy.** Some proxies block or strip WebSocket upgrades. The connection banner stays on "connecting" or ends with "Connection lost", while normal pages load fine. Ask the network team to allow `wss://` traffic to your domain on port 443, or test from mobile data to confirm the proxy is the cause. There is no long-polling fallback.

**Preview deployments fail or show a blank room.** Preview builds are not supported for Workers with Durable Objects. Turn Preview builds off in the project settings (step 4).

**`npm run db:migrate:remote` says it cannot find the database.** `database_name` in `wrangler.jsonc` must be `quiz-db` (the name used in the npm script) and `database_id` must be the id from `wrangler d1 create`. Run `npx wrangler d1 list` to see what exists in the logged-in account.
