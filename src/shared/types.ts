import type { QuestionConfig, RoomSettings } from './schemas';
export type { RoomSettings } from './schemas';

export type QuestionType = QuestionConfig['type'];

export type PublicConfig =
  | { type: 'quiz'; choices: { id: string; label: string }[] }
  | { type: 'true_false' }
  | { type: 'type_answer' }
  | { type: 'puzzle'; items: { id: string; label: string }[] }
  | { type: 'poll'; choices: { id: string; label: string }[] }
  | { type: 'slide'; body: string }
  | { type: 'multi_select'; choices: { id: string; label: string }[] }
  | { type: 'slider'; min: number; max: number; step: number }
  | { type: 'drop_pin'; imageUrl: string }
  | { type: 'scale'; minLabel: string; maxLabel: string; steps: number };

export type WireQuestion = {
  id: string;
  index: number;
  type: QuestionType;
  prompt: string;
  timeLimitSec: number;
  points: number;
  config: PublicConfig;
  /** Optional picture shown with the question (host screen always; player screens when there is room). */
  imageUrl?: string;
};

export type PlayerRow = {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
  teamId: string | null;
};

export type ScoreRow = PlayerRow & { rank: number };

export type TeamStanding = {
  id: string;
  name: string;
  color: string;
  score: number;
  rank: number;
  memberCount: number;
};

export type TeamWithMembers = TeamStanding & { members: PlayerRow[] };

export type Standings =
  | { kind: 'players'; rows: ScoreRow[] }
  | { kind: 'teams'; rows: TeamStanding[] };

export type GamePhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'scoreboard' | 'finished';

export type GameSnapshot = {
  phase: GamePhase;
  /** Game options for this room; present on every WELCOME / RECONNECTED. */
  settings: RoomSettings;
  currentIndex: number;
  total: number;
  serverTime: number;
  question?: WireQuestion;
  endsAt?: number;
  paused?: boolean;
  answerCount?: number;
};

export type CorrectAnswer =
  | { type: 'choice'; ids: string[] }
  | { type: 'text'; accepted: string[] }
  | { type: 'puzzle'; order: string[] }
  | { type: 'number'; value: number; tolerance: number }
  | { type: 'pin'; x: number; y: number; tolerance: number }
  | { type: 'none' };

/**
 * One player's personal position, computed by the room and sent only to that player's socket.
 * Ties share a rank (1, 2, 2, 4). `behind` is the closest player/team with a strictly higher
 * score and the gap to them; it is absent when you are in 1st place.
 */
export type PersonalStanding = {
  rank: number;
  totalPlayers: number;
  score: number;
  behind?: { nickname: string; points: number };
  team?: {
    id: string;
    name: string;
    color: string;
    rank: number;
    totalTeams: number;
    score: number;
    behind?: { name: string; points: number };
  };
};

export type ServerEvent =
  | {
      type: 'WELCOME'; roomCode: string; isTeam: boolean; teams: TeamWithMembers[];
      players: PlayerRow[]; phase: GamePhase; snapshot: GameSnapshot;
    }
  | { type: 'JOINED'; playerId: string; sessionId: string }
  | { type: 'RECONNECTED'; playerId: string; score: number; streak: number; snapshot: GameSnapshot }
  | { type: 'LOBBY_UPDATE'; players: PlayerRow[]; teams: TeamWithMembers[] }
  | {
      type: 'QUESTION_STARTED';
      question: WireQuestion;
      index: number;
      total: number;
      endsAt: number;
      serverTime: number;
    }
  | { type: 'ANSWER_ACK'; accepted: boolean; reason?: string }
  | { type: 'ANSWER_COUNT'; count: number }
  | { type: 'PLAYER_RESULT'; score: number; streak: number; pointsAwarded: number; correct: boolean;
      teamId?: string; teamName?: string; teamColor?: string; teamScore?: number }
  | {
      type: 'QUESTION_REVEALED';
      questionId: string;
      correct: CorrectAnswer;
      distribution: Record<string, number>;
      standings: Standings;
    }
  | { type: 'GAME_FINISHED'; podium: Standings; playerResult?: ScoreRow }
  /** Sent per player after QUESTION_REVEALED (final: false) and after GAME_FINISHED (final: true). */
  | ({ type: 'YOUR_STANDING'; final: boolean } & PersonalStanding)
  | { type: 'PLAYER_KICKED'; playerId: string }
  | { type: 'PAUSED' }
  | { type: 'RESUMED'; endsAt: number }
  | { type: 'ERROR'; message: string; code?: string };

export type ClientEvent =
  | { type: 'JOIN'; nickname: string; teamId?: string }
  | { type: 'RECONNECT'; playerId: string }
  | { type: 'ANSWER'; questionId: string; answer: unknown }
  | { type: 'HOST_START'; hostToken: string }
  | { type: 'HOST_NEXT'; hostToken: string }
  | { type: 'HOST_SKIP'; hostToken: string }
  | { type: 'HOST_PAUSE'; hostToken: string }
  | { type: 'HOST_RESUME'; hostToken: string }
  | { type: 'HOST_KICK'; hostToken: string; playerId: string }
  | { type: 'HOST_END'; hostToken: string };
