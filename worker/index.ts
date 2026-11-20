import { Hono } from 'hono';
import { ZodError } from 'zod';
import { RoomDO } from './room/RoomDO';
import { quizzesRoute } from './api/quizzes';
import { sessionsRoute } from './api/sessions';
import { authRoute, checkOrigin, requireAuth } from './api/auth';
import { ROOM_CODE_RE } from './room/roomCode';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: 'invalid request', issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: 'internal error' }, 500);
});

app.use('/api/*', checkOrigin);
app.use('/api/quizzes/*', requireAuth);
app.use('/api/sessions/*', requireAuth);
app.route('/api/auth', authRoute);
app.route('/api/quizzes', quizzesRoute);
app.route('/api/sessions', sessionsRoute);
app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/ws/room/:code', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }
  const code = c.req.param('code');
  if (!ROOM_CODE_RE.test(code)) return c.text('Invalid room code', 400);
  const id = c.env.ROOM.idFromName(code);
  return c.env.ROOM.get(id).fetch(c.req.raw);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
export { RoomDO };
