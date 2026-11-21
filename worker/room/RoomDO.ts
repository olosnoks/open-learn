import { DurableObject } from 'cloudflare:workers';
import { ClientEventSchema, DEFAULT_ROOM_SETTINGS, type RoomSettings } from '../../src/shared/schemas';
import { classicScoring, accuracyScoring } from './scoring';
import {
  assignNickname, autoAdvanceAfterReveal, autoAdvanceStep, evaluateAnswer, getCorrectAnswer,
  pickChoiceOrder, rankEntries, shuffleQuestionOrder, toWireQuestion, UNSCORED_TYPES,
  type AutoAdvanceStage, type StoredQuestion,
} from './machine';
import type {
  ServerEvent, GamePhase, GameSnapshot, PlayerRow, ScoreRow,
  TeamWithMembers, TeamStanding, Standings, PersonalStanding,
} from '../../src/shared/types';

type Mode = 'classic' | 'accuracy' | 'lecture';

type InitPayload = {
  sessionId: string;
  hostId: string;
  hostToken: string;
  roomCode: string;
  mode: Mode;
  isTeam: boolean;
  teamCount?: number;
  settings?: Partial<RoomSettings>;
  questions: StoredQuestion[];
};

type GameState = {
  sessionId: string;
  hostId: string;
  hostToken: string;
  roomCode: string;
  mode: Mode;
  isTeam: boolean;
  teamCount: number;
  settings: RoomSettings;
  phase: GamePhase;
  currentIndex: number;
  questions: StoredQuestion[];
  questionStartedAt: number;
  endsAt: number;
  hostPausedAt: number | null;
  /** Display order (choice / puzzle item ids) of the current question; null = authored order. */
  choiceOrder?: string[] | null;
  /** Set while an auto-advancing room sits on the reveal; drives the alarm. */
  auto?: AutoAdvanceStage | null;
};

/** Survives hibernation via ws.serializeAttachment(); plain JS properties on `ws` do not. */
type Attachment = { connId: string };

const MAX_MESSAGE_CHARS = 8 * 1024;
const ANSWER_GRACE_MS = 500;
const MAX_PLAYERS = 200;
/**
 * A player whose socket dropped this recently still counts as "expected to answer".
 * Without it, the JoinScreen -> PlayerGame socket handoff (or any brief network blip)
 * could trigger the everyone-answered auto-reveal before that player had a chance.
 */
const RECONNECT_GRACE_MS = 10_000;

const TEAM_DEFS = [
  { id: 'red',    name: 'Red',    color: '#D9294A' },
  { id: 'blue',   name: 'Blue',   color: '#1268C9' },
  { id: 'yellow', name: 'Yellow', color: '#C99200' },
  { id: 'green',  name: 'Green',  color: '#1F7A3A' },
];

export class RoomDO extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          nickname TEXT NOT NULL UNIQUE,
          score INTEGER NOT NULL DEFAULT 0,
          streak INTEGER NOT NULL DEFAULT 0,
          connected INTEGER NOT NULL DEFAULT 1,
          connection_id TEXT,
          team_id TEXT,
          disconnected_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS answers (
          player_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          latency_ms INTEGER NOT NULL,
          is_correct INTEGER NOT NULL,
          points INTEGER NOT NULL,
          PRIMARY KEY (player_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS room_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      // Rooms created before disconnected_at existed: add the column in place.
      const cols = this.sql.exec(`PRAGMA table_info(players)`).toArray().map((r) => r.name);
      if (!cols.includes('disconnected_at')) {
        this.sql.exec(`ALTER TABLE players ADD COLUMN disconnected_at INTEGER`);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') return this.handleInit(request);
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.handleUpgrade();
    return new Response('Not found', { status: 404 });
  }

  private async handleInit(request: Request): Promise<Response> {
    const payload = (await request.json()) as InitPayload;
    if (this.getState()) return new Response('Already initialized', { status: 409 });

    const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...(payload.settings ?? {}) };
    // Shuffled once here and persisted, so the order survives hibernation and reconnects.
    const questions = settings.shuffleQuestions ? shuffleQuestionOrder(payload.questions) : payload.questions;
    this.setState({
      sessionId: payload.sessionId, hostId: payload.hostId, hostToken: payload.hostToken,
      roomCode: payload.roomCode, mode: payload.mode, isTeam: payload.isTeam,
      teamCount: payload.teamCount ?? 2,
      settings,
      phase: 'lobby', currentIndex: 0, questions,
      questionStartedAt: 0, endsAt: 0, hostPausedAt: null,
      choiceOrder: null, auto: null,
    });

    if (payload.isTeam) {
      const count = Math.max(2, Math.min(4, payload.teamCount ?? 2));
      for (let i = 0; i < count; i++) {
        const t = TEAM_DEFS[i];
        this.sql.exec(`INSERT INTO teams (id, name, color) VALUES (?, ?, ?)`, t.id, t.name, t.color);
      }
    }
    return new Response('ok');
  }

  private handleUpgrade(): Response {
    const state = this.getState();
    if (!state) return new Response('Room not initialized', { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connId: crypto.randomUUID() } satisfies Attachment);
    this.send(server, {
      type: 'WELCOME',
      roomCode: state.roomCode,
      isTeam: state.isTeam,
      teams: this.teams(),
      players: this.players(),
      phase: state.phase,
      snapshot: this.snapshot(state),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) {
      return this.send(ws, { type: 'ERROR', message: 'Message rejected', code: 'BAD_MESSAGE' });
    }
    let json: unknown;
    try { json = JSON.parse(raw); }
    catch { return this.send(ws, { type: 'ERROR', message: 'Invalid JSON', code: 'BAD_MESSAGE' }); }

    const parsed = ClientEventSchema.safeParse(json);
    if (!parsed.success) {
      return this.send(ws, { type: 'ERROR', message: 'Invalid message', code: 'BAD_MESSAGE' });
    }
    const data = parsed.data;

    const state = this.getState();
    if (!state) return this.send(ws, { type: 'ERROR', message: 'Room not ready' });

    switch (data.type) {
      case 'JOIN': return this.handleJoin(ws, data.nickname, data.teamId, state);
      case 'RECONNECT': return this.handleReconnect(ws, data.playerId, state);
      case 'ANSWER': return this.handleAnswer(ws, data.questionId, data.answer, state);
      case 'HOST_START':
        if (this.isHost(ws, data.hostToken, state)) await this.handleHostStart(state);
        return;
      case 'HOST_NEXT':
        if (this.isHost(ws, data.hostToken, state)) await this.handleNext(state);
        return;
      case 'HOST_SKIP':
        if (this.isHost(ws, data.hostToken, state)) await this.handleReveal(state);
        return;
      case 'HOST_PAUSE':
        if (this.isHost(ws, data.hostToken, state)) await this.handlePause(state);
        return;
      case 'HOST_RESUME':
        if (this.isHost(ws, data.hostToken, state)) await this.handleResume(state);
        return;
      case 'HOST_KICK':
        if (this.isHost(ws, data.hostToken, state)) this.handleKick(data.playerId);
        return;
      case 'HOST_END':
        if (this.isHost(ws, data.hostToken, state)) await this.handleFinish(state);
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    const playerId = this.playerIdFor(ws);
    if (playerId) {
      this.sql.exec(`UPDATE players SET connected = 0, disconnected_at = ? WHERE id = ?`, Date.now(), playerId);
      this.broadcast({ type: 'LOBBY_UPDATE', players: this.players(), teams: this.teams() });
    }
  }

  /**
   * One alarm, two jobs: the question timer (phase 'question') and the auto-advance timer
   * (phase 'reveal' with settings.autoAdvance). Both are cleared by whatever host action
   * supersedes them, so a stale alarm finds nothing to do and returns.
   */
  async alarm() {
    const state = this.getState();
    if (!state) return;
    if (state.phase === 'question') {
      if (!state.hostPausedAt) await this.handleReveal(state);
      return;
    }
    const action = autoAdvanceStep({
      phase: state.phase, settings: state.settings ?? DEFAULT_ROOM_SETTINGS, stage: state.auto,
      currentIndex: state.currentIndex, total: state.questions.length, now: Date.now(),
    });
    switch (action.kind) {
      case 'scoreboard': {
        const auto: AutoAdvanceStage = { stage: 'scoreboard', at: action.at };
        this.setState({ ...state, auto });
        await this.ctx.storage.setAlarm(action.at);
        return;
      }
      case 'next': return this.handleNext(state);
      case 'finish': return this.handleFinish(state);
      case 'none':
        // Fired a hair early for a pending stage: re-arm rather than strand the room on the reveal.
        if (state.phase === 'reveal' && state.auto && state.settings?.autoAdvance) {
          await this.ctx.storage.setAlarm(state.auto.at);
        }
        return;
    }
  }

  private handleJoin(ws: WebSocket, nickname: string, teamId: string | undefined, state: GameState) {
    if (state.phase !== 'lobby') return this.send(ws, { type: 'ERROR', message: 'Game already started' });
    if (this.playerIdFor(ws)) return this.send(ws, { type: 'ERROR', message: 'Already joined' });
    const count = this.sql.exec(`SELECT COUNT(*) AS c FROM players`).one().c as number;
    if (count >= MAX_PLAYERS) return this.send(ws, { type: 'ERROR', message: 'Room is full' });

    const generated = Boolean((state.settings ?? DEFAULT_ROOM_SETTINGS).nicknameGenerator);
    let resolvedNickname: string;
    if (generated) {
      // The room picks the name; whatever the client typed (or previewed) is ignored.
      resolvedNickname = assignNickname((name) => this.nicknameTaken(name));
    } else {
      const trimmed = nickname.trim();
      if (!trimmed || trimmed.length > 20) return this.send(ws, { type: 'ERROR', message: 'Nickname must be 1–20 chars' });
      if (this.nicknameTaken(trimmed)) return this.send(ws, { type: 'ERROR', message: 'Nickname taken' });
      resolvedNickname = trimmed;
    }

    let resolvedTeamId: string | null = null;
    if (state.isTeam) {
      if (!teamId) return this.send(ws, { type: 'ERROR', message: 'Choose a team', code: 'TEAM_REQUIRED' });
      const team = this.sql.exec(`SELECT id FROM teams WHERE id = ?`, teamId).toArray();
      if (!team[0]) return this.send(ws, { type: 'ERROR', message: 'Unknown team', code: 'TEAM_INVALID' });
      resolvedTeamId = teamId;
    }

    const playerId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO players (id, nickname, score, streak, connected, connection_id, team_id)
       VALUES (?, ?, 0, 0, 1, ?, ?)`,
      playerId, resolvedNickname, this.connectionId(ws), resolvedTeamId
    );
    this.send(ws, {
      type: 'JOINED', playerId, sessionId: state.sessionId,
      ...(generated ? { nickname: resolvedNickname } : {}),
    });
    this.broadcast({ type: 'LOBBY_UPDATE', players: this.players(), teams: this.teams() });
  }

  private nicknameTaken(nickname: string): boolean {
    return this.sql.exec(`SELECT 1 FROM players WHERE nickname = ?`, nickname).toArray().length > 0;
  }

  private handleReconnect(ws: WebSocket, playerId: string, state: GameState) {
    const found = this.sql.exec(
      `SELECT id, score, streak FROM players WHERE id = ?`, playerId
    ).toArray();
    if (!found[0]) return this.send(ws, { type: 'ERROR', message: 'Unknown player', code: 'UNKNOWN_PLAYER' });
    this.sql.exec(
      `UPDATE players SET connected = 1, disconnected_at = NULL, connection_id = ? WHERE id = ?`,
      this.connectionId(ws), playerId
    );
    this.send(ws, {
      type: 'RECONNECTED',
      playerId,
      score: found[0].score as number,
      streak: found[0].streak as number,
      snapshot: this.snapshot(state),
    });
    // A player who reconnects during the reveal still gets their standing for the feedback screen.
    if (state.phase === 'reveal') this.sendPersonalStandings(state, false, ws);
    this.broadcast({ type: 'LOBBY_UPDATE', players: this.players(), teams: this.teams() });
  }

  private async handleAnswer(ws: WebSocket, questionId: string, answer: unknown, state: GameState) {
    const now = Date.now();
    if (state.phase !== 'question' || state.hostPausedAt || now > state.endsAt + ANSWER_GRACE_MS) {
      return this.send(ws, { type: 'ANSWER_ACK', accepted: false, reason: 'not accepting' });
    }
    const playerId = this.playerIdFor(ws);
    if (!playerId) return this.send(ws, { type: 'ANSWER_ACK', accepted: false, reason: 'not joined' });

    const question = state.questions[state.currentIndex];
    if (!question || question.id !== questionId) {
      return this.send(ws, { type: 'ANSWER_ACK', accepted: false, reason: 'wrong question' });
    }
    const already = this.sql.exec(
      `SELECT 1 FROM answers WHERE player_id = ? AND question_id = ?`, playerId, question.id
    ).toArray();
    if (already.length) return this.send(ws, { type: 'ANSWER_ACK', accepted: false, reason: 'duplicate' });

    const timeLimitMs = question.timeLimitSec * 1000;
    const latencyMs = Math.min(now - state.questionStartedAt, timeLimitMs);
    const isCorrect = evaluateAnswer(question, answer);
    const scored = !UNSCORED_TYPES.has(question.type) && state.mode !== 'lecture';
    const strategy = state.mode === 'accuracy' ? accuracyScoring : classicScoring;
    // The streak before this answer feeds the classic-mode streak bonus (see scoring.ts).
    const prior = this.sql.exec(`SELECT streak FROM players WHERE id = ?`, playerId).one();
    const points = scored
      ? strategy.score({
          isCorrect, latencyMs, timeLimitMs, maxPoints: question.points, streak: prior.streak as number,
        })
      : 0;

    this.sql.exec(
      `INSERT INTO answers (player_id, question_id, payload, latency_ms, is_correct, points)
       VALUES (?, ?, ?, ?, ?, ?)`,
      playerId, question.id, JSON.stringify(answer ?? null), latencyMs, isCorrect ? 1 : 0, points
    );
    if (scored) {
      this.sql.exec(
        `UPDATE players SET score = score + ?,
         streak = CASE WHEN ? THEN streak + 1 ELSE 0 END WHERE id = ?`,
        points, isCorrect ? 1 : 0, playerId
      );
    }

    this.send(ws, { type: 'ANSWER_ACK', accepted: true });

    const updated = this.sql.exec(`SELECT score, streak FROM players WHERE id = ?`, playerId).one();
    let teamInfo: Partial<Extract<ServerEvent, { type: 'PLAYER_RESULT' }>> = {};
    if (state.isTeam) {
      const team = this.sql.exec(
        `SELECT t.id, t.name, t.color FROM teams t
         JOIN players p ON p.team_id = t.id WHERE p.id = ?`, playerId
      ).toArray();
      if (team[0]) {
        const sum = this.sql.exec(
          `SELECT COALESCE(SUM(score), 0) as s FROM players WHERE team_id = ?`, team[0].id
        ).one();
        teamInfo = {
          teamId: team[0].id as string,
          teamName: team[0].name as string,
          teamColor: team[0].color as string,
          teamScore: sum.s as number,
        };
      }
    }
    this.send(ws, {
      type: 'PLAYER_RESULT',
      score: updated.score as number,
      streak: updated.streak as number,
      pointsAwarded: points,
      correct: isCorrect,
      ...teamInfo,
    });

    const answered = this.answerCount(question.id);
    this.broadcast({ type: 'ANSWER_COUNT', count: answered });

    // Everyone still here has answered: don't make the room wait out the timer.
    // Recently-dropped players count as "still here" (see RECONNECT_GRACE_MS).
    const expected = this.sql.exec(
      `SELECT COUNT(*) AS c FROM players WHERE connected = 1 OR disconnected_at > ?`,
      now - RECONNECT_GRACE_MS
    ).one().c as number;
    if (expected > 0 && answered >= expected) await this.handleReveal(state);
  }

  private async handleHostStart(state: GameState) {
    if (state.phase !== 'lobby') return;
    await this.startQuestion({ ...state, currentIndex: 0 });
  }

  private async handleNext(state: GameState) {
    if (state.phase !== 'reveal') return;
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.questions.length) return this.handleFinish(state);
    await this.startQuestion({ ...state, currentIndex: nextIndex });
  }

  private async startQuestion(state: GameState) {
    const q = state.questions[state.currentIndex];
    const now = Date.now();
    const endsAt = now + q.timeLimitSec * 1000;
    // Decided once per question and persisted: host, players and reconnects all get this order.
    const choiceOrder = pickChoiceOrder(q, state.settings ?? DEFAULT_ROOM_SETTINGS);
    this.setState({
      ...state, phase: 'question', questionStartedAt: now, endsAt, hostPausedAt: null,
      choiceOrder, auto: null,
    });
    await this.ctx.storage.setAlarm(endsAt);
    this.broadcast({
      type: 'QUESTION_STARTED',
      question: toWireQuestion(q, state.currentIndex, choiceOrder),
      index: state.currentIndex,
      total: state.questions.length,
      endsAt, serverTime: now,
    });
  }

  private async handleReveal(state: GameState) {
    if (state.phase !== 'question') return;
    const q = state.questions[state.currentIndex];
    const auto = autoAdvanceAfterReveal(state.settings ?? DEFAULT_ROOM_SETTINGS, Date.now());
    this.setState({ ...state, phase: 'reveal', hostPausedAt: null, auto });
    // With auto-advance the alarm now counts down the reveal; otherwise the host drives from here.
    if (auto) await this.ctx.storage.setAlarm(auto.at);
    else await this.ctx.storage.deleteAlarm();
    this.broadcast({
      type: 'QUESTION_REVEALED',
      questionId: q.id,
      correct: getCorrectAnswer(q),
      distribution: this.distribution(q.id),
      standings: this.standings(),
    });
    this.sendPersonalStandings(state, false);
  }

  private async handlePause(state: GameState) {
    if (state.phase !== 'question' || state.hostPausedAt) return;
    this.setState({ ...state, hostPausedAt: Date.now() });
    await this.ctx.storage.deleteAlarm();
    this.broadcast({ type: 'PAUSED' });
  }

  private async handleResume(state: GameState) {
    if (state.phase !== 'question' || !state.hostPausedAt) return;
    const remaining = Math.max(0, state.endsAt - state.hostPausedAt);
    const now = Date.now();
    const endsAt = now + remaining;
    // Shift the start forward too, so speed scoring ignores the paused interval.
    const questionStartedAt = state.questionStartedAt + (now - state.hostPausedAt);
    this.setState({ ...state, endsAt, questionStartedAt, hostPausedAt: null });
    await this.ctx.storage.setAlarm(endsAt);
    this.broadcast({ type: 'RESUMED', endsAt });
  }

  private handleKick(playerId: string) {
    const row = this.sql.exec(`SELECT connection_id FROM players WHERE id = ?`, playerId).toArray()[0];
    if (!row) return;
    this.sql.exec(`DELETE FROM answers WHERE player_id = ?`, playerId);
    this.sql.exec(`DELETE FROM players WHERE id = ?`, playerId);
    this.broadcast({ type: 'PLAYER_KICKED', playerId });
    for (const ws of this.ctx.getWebSockets()) {
      if (this.connectionId(ws) === row.connection_id) {
        try { ws.close(4001, 'Kicked by host'); } catch { /* already closed */ }
      }
    }
    this.broadcast({ type: 'LOBBY_UPDATE', players: this.players(), teams: this.teams() });
  }

  private async handleFinish(state: GameState) {
    if (state.phase === 'finished') return;
    this.setState({ ...state, phase: 'finished', auto: null });
    await this.ctx.storage.deleteAlarm();
    const podium = this.standings(3);
    this.broadcast({ type: 'GAME_FINISHED', podium });
    // Before the D1 write below, which deletes the player rows on success.
    this.sendPersonalStandings(state, true);

    try {
      const summary = JSON.stringify({
        isTeam: state.isTeam,
        players: this.players(),
        teams: state.isTeam ? this.teams() : [],
        podium,
      });

      const statements = [
        this.env.DB.prepare(
          `UPDATE game_sessions SET ended_at = ?, summary_json = ? WHERE id = ?`
        ).bind(Date.now(), summary, state.sessionId),
      ];

      const answerRows = this.sql.exec(
        `SELECT a.player_id, p.nickname, a.question_id, a.payload,
                a.latency_ms, a.is_correct, a.points
         FROM answers a JOIN players p ON p.id = a.player_id`
      ).toArray();
      const promptById = new Map(state.questions.map((q) => [q.id, q.prompt] as const));

      for (const a of answerRows) {
        statements.push(
          this.env.DB.prepare(
            `INSERT INTO session_answers
             (session_id, player_id, player_nickname, question_id, question_prompt,
              payload, latency_ms, is_correct, points)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            state.sessionId, a.player_id as string, a.nickname as string,
            a.question_id as string, promptById.get(a.question_id as string) ?? '',
            a.payload as string, a.latency_ms as number,
            a.is_correct as number, a.points as number
          )
        );
      }
      await this.env.DB.batch(statements);
    } catch (e) {
      // Keep the DO data if the D1 write fails, so nothing is lost.
      console.error('summary write failed', e);
      return;
    }

    this.sql.exec(`DELETE FROM answers`);
    this.sql.exec(`DELETE FROM players`);
    this.sql.exec(`DELETE FROM teams`);
    this.sql.exec(`DELETE FROM room_state`);
  }

  private getState(): GameState | null {
    const row = this.sql.exec(`SELECT value FROM room_state WHERE key = 'game'`).toArray();
    return row[0] ? (JSON.parse(row[0].value as string) as GameState) : null;
  }

  private setState(s: GameState) {
    this.sql.exec(
      `INSERT INTO room_state (key, value) VALUES ('game', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(s)
    );
  }

  private snapshot(state: GameState): GameSnapshot {
    const base: GameSnapshot = {
      phase: state.phase,
      currentIndex: state.currentIndex,
      total: state.questions.length,
      serverTime: Date.now(),
      settings: state.settings ?? DEFAULT_ROOM_SETTINGS,
    };
    if (state.phase === 'question' || state.phase === 'reveal') {
      const q = state.questions[state.currentIndex];
      base.question = toWireQuestion(q, state.currentIndex, state.choiceOrder);
      base.endsAt = state.endsAt;
      base.paused = Boolean(state.hostPausedAt);
      base.answerCount = this.answerCount(q.id);
    }
    return base;
  }

  private answerCount(questionId: string): number {
    return this.sql.exec(
      `SELECT COUNT(*) as c FROM answers WHERE question_id = ?`, questionId
    ).one().c as number;
  }

  private players(): PlayerRow[] {
    return this.sql.exec(
      `SELECT id, nickname, score, streak, connected, team_id
       FROM players ORDER BY nickname`
    ).toArray().map((r) => ({
      id: r.id as string,
      nickname: r.nickname as string,
      score: r.score as number,
      streak: r.streak as number,
      connected: Boolean(r.connected),
      teamId: (r.team_id as string | null) ?? null,
    }));
  }

  private teams(): TeamWithMembers[] {
    const rows = this.sql.exec(`SELECT id, name, color FROM teams ORDER BY rowid`).toArray();
    const all = this.players();
    return rows.map((r) => {
      const members = all.filter((p) => p.teamId === r.id);
      const score = members.reduce((s, m) => s + m.score, 0);
      return {
        id: r.id as string, name: r.name as string, color: r.color as string,
        score, rank: 0, memberCount: members.length, members,
      };
    });
  }

  private leaderboard(limit = 5): ScoreRow[] {
    return this.sql.exec(
      `SELECT id, nickname, score, streak, connected, team_id
       FROM players ORDER BY score DESC, nickname LIMIT ?`, limit
    ).toArray().map((r, i) => ({
      id: r.id as string,
      nickname: r.nickname as string,
      score: r.score as number,
      streak: r.streak as number,
      connected: Boolean(r.connected),
      teamId: (r.team_id as string | null) ?? null,
      rank: i + 1,
    }));
  }

  private standings(limit = 5): Standings {
    if (this.getState()?.isTeam) {
      const ranked: TeamStanding[] = this.teams()
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((t, i) => ({
          id: t.id, name: t.name, color: t.color,
          score: t.score, rank: i + 1, memberCount: t.memberCount,
        }));
      return { kind: 'teams', rows: ranked };
    }
    return { kind: 'players', rows: this.leaderboard(limit) };
  }

  /**
   * Sends each joined player's socket its own rank, computed here from the players table.
   * Sockets are matched to players by the connection id in their hibernation attachment.
   * With `only`, sends to that one socket instead of every socket.
   */
  private sendPersonalStandings(state: GameState, final: boolean, only?: WebSocket) {
    const rows = this.sql.exec(
      `SELECT id, nickname, score, team_id, connection_id FROM players`
    ).toArray();
    if (!rows.length) return;

    const playerRanks = rankEntries(rows.map((r) => ({
      id: r.id as string, name: r.nickname as string, score: r.score as number,
    })));
    const teams = state.isTeam ? this.teams() : [];
    const teamRanks = rankEntries(teams.map((t) => ({ id: t.id, name: t.name, score: t.score })));
    const teamById = new Map(teams.map((t) => [t.id, t] as const));

    const byConn = new Map<string, PersonalStanding>();
    for (const r of rows) {
      const connId = r.connection_id as string | null;
      const mine = playerRanks.get(r.id as string);
      if (!connId || !mine) continue;
      const standing: PersonalStanding = {
        rank: mine.rank,
        totalPlayers: mine.total,
        score: mine.score,
        ...(mine.behind ? { behind: { nickname: mine.behind.name, points: mine.behind.points } } : {}),
      };
      const team = r.team_id ? teamById.get(r.team_id as string) : undefined;
      const teamRank = team ? teamRanks.get(team.id) : undefined;
      if (team && teamRank) {
        standing.team = {
          id: team.id, name: team.name, color: team.color,
          rank: teamRank.rank, totalTeams: teamRank.total, score: teamRank.score,
          ...(teamRank.behind ? { behind: teamRank.behind } : {}),
        };
      }
      byConn.set(connId, standing);
    }

    for (const ws of only ? [only] : this.ctx.getWebSockets()) {
      const standing = byConn.get(this.connectionId(ws));
      if (standing) this.send(ws, { type: 'YOUR_STANDING', final, ...standing });
    }
  }

  private distribution(questionId: string): Record<string, number> {
    const rows = this.sql.exec(
      `SELECT payload, COUNT(*) as c FROM answers WHERE question_id = ? GROUP BY payload`,
      questionId
    ).toArray();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.payload as string] = r.c as number;
    return out;
  }

  private isHost(ws: WebSocket, token: string, state: GameState): boolean {
    if (token !== state.hostToken) {
      this.send(ws, { type: 'ERROR', message: 'Unauthorized' });
      return false;
    }
    return true;
  }

  private playerIdFor(ws: WebSocket): string | null {
    const connId = this.connectionId(ws);
    if (!connId) return null;
    const row = this.sql.exec(`SELECT id FROM players WHERE connection_id = ?`, connId).toArray();
    return row[0] ? (row[0].id as string) : null;
  }

  private connectionId(ws: WebSocket): string {
    return (ws.deserializeAttachment() as Attachment | null)?.connId ?? '';
  }

  private send(ws: WebSocket, event: ServerEvent) {
    try { ws.send(JSON.stringify(event)); } catch { /* closed */ }
  }

  private broadcast(event: ServerEvent) {
    const msg = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* closed */ }
    }
  }
}
