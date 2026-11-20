-- Dev scaffold: worker/api/auth.ts trusts `x-user-id: dev-user`, and D1 enforces
-- foreign keys, so quizzes/sessions need this row to exist. Remove with real auth.
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, created_at)
VALUES ('dev-user', 'dev@localhost', '!', 'Dev User', 0);
