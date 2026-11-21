# Contributing

Thanks for helping. The flow is short: branch, test, pull request.

## Set up

Follow [docs/local-development.md](docs/local-development.md): `npm ci`, create `.dev.vars`, `npm run db:migrate`, `npm run dev`.

## Branch

Work on a branch off `main`, named for the change (`feat/team-balancing`, `fix/reconnect-after-reveal`, `docs/import-format`). Keep one topic per branch; small pull requests get reviewed faster.

## Test

Before opening a pull request, run all three and make sure they pass:

```bash
npm run typecheck
npm test
npx playwright install chromium && npm run test:e2e
```

Add or update tests with your change: unit tests in `tests/unit/` for anything in `worker/room/`, `worker/auth/`, `src/shared/` or `src/features/quiz-import/`; a Playwright spec in `tests/e2e/` for user-visible flows.

If you changed `worker/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/` together with `drizzle/meta/`. Do not edit existing migrations that may already be applied in someone's database.

## Pull request

- Describe what changed and why, and how you tested it. Screenshots help for UI changes.
- Keep `README.md` and `docs/` in step with behaviour you change (routes, formats, commands, limits).
- Do not commit `.dev.vars`, `.wrangler/`, or anything with a secret in it. `.gitignore` already covers these.
- Do not change `database_id` in `wrangler.jsonc` unless the pull request is about deployment configuration.

## Things to know before you start

- The free Cloudflare plan allows 10 ms CPU per request. Keep the Worker thin and keep per-message work in the Durable Object small.
- Nothing may be stored on `RoomDO` as a class property or on a `WebSocket` object: rooms hibernate. Use the room's SQLite and `serializeAttachment` (see [docs/architecture.md](docs/architecture.md)).
- Account creation is planned to move to Microsoft SSO (Entra ID). Do not extend the password flow.
- Check open pull requests before starting, to avoid overlapping with work in flight.
