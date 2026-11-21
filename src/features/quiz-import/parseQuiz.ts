import { QuestionConfigSchema, type QuestionConfig } from '../../shared/schemas';

/**
 * Turns a spreadsheet (CSV, TSV pasted from Google Sheets / Excel) or JSON into the
 * payload POST /api/quizzes accepts. Pure: no DOM, no network — unit tested.
 *
 * Spreadsheet format — one row per question, header row required, column order free:
 *   question | type | answer1..answer6 | correct | time | points | image
 * - image (or image_url / picture): optional https:// link to a picture shown with the question.
 * - type: quiz (default), multi, truefalse, type, poll, puzzle, slide (aliases accepted)
 * - correct: answer number(s) "2" or "1,3", or the answer text itself;
 *   true/false for truefalse. Not needed for poll / puzzle / slide / type.
 * - type answers: every answer column is an accepted spelling.
 * - puzzle: answers in the correct order (players see them shuffled).
 * - slide: the question is the heading, answer1 is the body text.
 */

export type ImportedQuestion = {
  prompt: string;
  timeLimitSec: number;
  points: number;
  type: QuestionConfig;
  /** Optional https image URL (the `image` column). Absent when the cell is empty. */
  imageUrl?: string;
};

/** Same rule as the Worker: an https:// URL that parses, at most 2048 characters. */
export function isHttpsImageUrl(s: string): boolean {
  if (s.length > 2048) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
}

export type ParseResult = {
  title?: string;
  questions: ImportedQuestion[];
  /** Row-level problems; rows with errors are skipped. `row` is 1-based as shown in a spreadsheet. */
  errors: { row: number; message: string }[];
};

export const TEMPLATE_CSV = [
  'question,type,answer1,answer2,answer3,answer4,correct,time,points,image',
  'What is the capital of France?,quiz,Paris,Rome,Madrid,Berlin,1,20,1000,',
  'Which of these are prime numbers?,multi,2,4,7,9,"1,3",30,1000,',
  'The Earth orbits the Sun.,truefalse,,,,,true,10,500,',
  'Type the chemical symbol for water,type,H2O,H₂O,,,,20,1000,',
  'Put these planets in order from the Sun,puzzle,Mercury,Venus,Earth,Mars,,30,1000,https://placehold.co/600x400',
  'Which topic should we do next?,poll,Space,Oceans,Dinosaurs,,,20,0,',
].join('\n');

const TYPE_ALIASES: Record<string, QuestionConfig['type']> = {
  quiz: 'quiz', single: 'quiz', mc: 'quiz', 'multiple choice': 'quiz', choice: 'quiz',
  multi: 'multi_select', multi_select: 'multi_select', 'multi select': 'multi_select', multiple: 'multi_select', checkbox: 'multi_select',
  truefalse: 'true_false', true_false: 'true_false', 'true/false': 'true_false', tf: 'true_false', 'true false': 'true_false',
  type: 'type_answer', type_answer: 'type_answer', text: 'type_answer', 'type answer': 'type_answer', open: 'type_answer',
  poll: 'poll', survey: 'poll',
  puzzle: 'puzzle', order: 'puzzle', ordering: 'puzzle', sequence: 'puzzle',
  slide: 'slide', info: 'slide',
};

const TRUE_WORDS = new Set(['true', 't', 'yes', 'y', '1', 'correct', 'right']);
const FALSE_WORDS = new Set(['false', 'f', 'no', 'n', '0', 'wrong', 'incorrect']);

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function detectDelimiter(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

function classifyHeader(h: string): { kind: 'question' | 'type' | 'correct' | 'time' | 'points' | 'image' | 'answer' | 'ignore'; n?: number } {
  const k = norm(h);
  if (['question', 'prompt', 'q', 'question text'].includes(k)) return { kind: 'question' };
  if (['type', 'question type', 'kind'].includes(k)) return { kind: 'type' };
  if (['correct', 'correct answer', 'correct answers', 'answer key', 'key', 'right answer'].includes(k)) return { kind: 'correct' };
  if (['time', 'time limit', 'seconds', 'time (s)', 'timer', 'time limit sec'].includes(k)) return { kind: 'time' };
  if (['points', 'score', 'pts'].includes(k)) return { kind: 'points' };
  if (['image', 'image url', 'picture', 'img', 'photo', 'media'].includes(k)) return { kind: 'image' };
  const m = k.match(/^(?:answer|option|choice|a)\s?(\d+)$/);
  if (m) return { kind: 'answer', n: Number(m[1]) };
  return { kind: 'ignore' };
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/** Resolve the "correct" cell to 0-based answer indexes: numbers ("1,3") or answer text. */
function correctIndexes(cell: string, answers: string[]): number[] | string {
  const raw = cell.trim();
  if (!raw) return [];
  const parts = raw.split(/[,;|/&+]|\band\b/).map((p) => p.trim()).filter(Boolean);
  if (parts.every((p) => /^\d+$/.test(p))) {
    const idx = parts.map((p) => Number(p) - 1);
    const bad = idx.find((i) => i < 0 || i >= answers.length);
    if (bad !== undefined) return `correct answer number ${bad + 1} doesn't match an answer column`;
    return [...new Set(idx)];
  }
  // Letters A-F as a convenience ("B" or "A,C").
  if (parts.every((p) => /^[a-f]$/i.test(p))) {
    const idx = parts.map((p) => p.toUpperCase().charCodeAt(0) - 65);
    if (idx.every((i) => i < answers.length)) return [...new Set(idx)];
  }
  // Whole cell or each part matched against answer text.
  const byText = (t: string) => answers.findIndex((a) => norm(a) === norm(t));
  const whole = byText(raw);
  if (whole >= 0) return [whole];
  const idx = parts.map(byText);
  if (idx.some((i) => i < 0)) return `couldn't match correct answer "${raw}" to any answer`;
  return [...new Set(idx)];
}

function numberOr(cell: string | undefined, fallback: number): number {
  const n = Number(cell?.trim());
  return cell && cell.trim() !== '' && Number.isFinite(n) ? n : fallback;
}

export function parseSpreadsheet(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const rows = parseDelimited(clean, detectDelimiter(firstLine))
    .filter((r) => r.some((c) => c.trim() !== ''));
  const errors: ParseResult['errors'] = [];
  const questions: ImportedQuestion[] = [];
  if (rows.length === 0) return { questions, errors: [{ row: 1, message: 'Nothing to import' }] };

  const header = rows[0].map(classifyHeader);
  const qCol = header.findIndex((h) => h.kind === 'question');
  if (qCol < 0) {
    return { questions, errors: [{ row: 1, message: 'First row must be a header with a "question" column (download the template to see the format)' }] };
  }
  const col = (kind: string) => header.findIndex((h) => h.kind === kind);
  const typeCol = col('type'), correctCol = col('correct'), timeCol = col('time'), pointsCol = col('points');
  const imageCol = col('image');
  const answerCols = header
    .map((h, i) => ({ ...h, i }))
    .filter((h) => h.kind === 'answer')
    .sort((a, b) => (a.n ?? 0) - (b.n ?? 0))
    .map((h) => h.i);

  rows.slice(1).forEach((r, k) => {
    const rowNum = k + 2;
    const fail = (message: string) => errors.push({ row: rowNum, message });
    const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

    const prompt = cell(qCol);
    if (!prompt) return fail('question is empty');
    const answers = answerCols.map(cell).filter((a) => a !== '');
    const correctCell = cell(correctCol);
    const typeCell = norm(cell(typeCol));

    let type: QuestionConfig['type'];
    if (typeCell) {
      const t = TYPE_ALIASES[typeCell] ?? TYPE_ALIASES[typeCell.replace(/ /g, '')];
      if (!t) return fail(`unknown type "${cell(typeCol)}" (use quiz, multi, truefalse, type, poll, puzzle or slide)`);
      type = t;
    } else if (answers.length === 0 && (TRUE_WORDS.has(norm(correctCell)) || FALSE_WORDS.has(norm(correctCell)))) {
      type = 'true_false';
    } else {
      type = 'quiz';
    }

    let config: unknown;
    switch (type) {
      case 'quiz':
      case 'multi_select': {
        const idx = correctIndexes(correctCell, answers);
        if (typeof idx === 'string') return fail(idx);
        if (idx.length === 0) return fail('needs a correct answer (e.g. "1" for answer1)');
        if (!typeCell && idx.length > 1) type = 'multi_select';
        if (type === 'quiz' && idx.length > 1) return fail('type "quiz" allows one correct answer — use type "multi" for several');
        config = {
          type,
          choices: answers.map((label, i) => ({ id: makeId(), label, isCorrect: idx.includes(i) })),
          ...(type === 'multi_select' ? { partialCredit: false } : {}),
        };
        break;
      }
      case 'true_false': {
        const v = norm(correctCell || answers[0] || '');
        if (!TRUE_WORDS.has(v) && !FALSE_WORDS.has(v)) return fail('true/false question needs "true" or "false" in the correct column');
        config = { type, correct: TRUE_WORDS.has(v) };
        break;
      }
      case 'type_answer': {
        const accepted = answers.length ? answers : correctCell ? [correctCell] : [];
        if (!accepted.length) return fail('type-answer question needs at least one accepted answer');
        config = { type, acceptedAnswers: accepted, caseSensitive: false };
        break;
      }
      case 'poll':
        config = { type, choices: answers.map((label) => ({ id: makeId(), label })) };
        break;
      case 'puzzle': {
        const items = answers.map((label) => ({ id: makeId(), label }));
        config = { type, items, correctOrder: items.map((i) => i.id) };
        break;
      }
      case 'slide':
        config = { type, body: answers.join('\n') };
        break;
    }

    const parsed = QuestionConfigSchema.safeParse(config);
    if (!parsed.success) return fail(friendlyIssue(type, parsed.error.issues[0]));
    if (prompt.length > 500) return fail('question is longer than 500 characters');

    const timeLimitSec = Math.round(numberOr(cell(timeCol), 20));
    const points = Math.round(numberOr(cell(pointsCol), type === 'poll' || type === 'slide' ? 0 : 1000));
    if (timeLimitSec < 5 || timeLimitSec > 240) return fail('time must be between 5 and 240 seconds');
    if (points < 0 || points > 2000) return fail('points must be between 0 and 2000');
    const imageUrl = cell(imageCol);
    if (imageUrl && !isHttpsImageUrl(imageUrl)) return fail('image must be an https:// link');

    questions.push({ prompt, timeLimitSec, points, type: parsed.data, ...(imageUrl ? { imageUrl } : {}) });
  });

  return { questions, errors };
}

function friendlyIssue(type: string, issue: { path: PropertyKey[]; message: string; code?: string } | undefined): string {
  const field = String(issue?.path[0] ?? '');
  if (field === 'choices' && (type === 'quiz')) return 'quiz questions need 2–4 answers';
  if (field === 'choices' && type === 'multi_select') return 'multi questions need 2–6 answers';
  if (field === 'choices') return 'poll questions need at least 2 answers';
  if (field === 'items' || field === 'correctOrder') return 'puzzle questions need at least 3 answers (in the correct order)';
  return issue?.message ?? 'invalid question';
}

/** JSON: either the API payload {title, questions:[{prompt, type:{...}}]} or a bare questions array. */
export function parseJson(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) {
    return { questions: [], errors: [{ row: 1, message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  const obj = (Array.isArray(data) ? { questions: data } : data) as { title?: unknown; questions?: unknown };
  if (!obj || !Array.isArray(obj.questions)) {
    return { questions: [], errors: [{ row: 1, message: 'JSON must have a "questions" array' }] };
  }
  const errors: ParseResult['errors'] = [];
  const questions: ImportedQuestion[] = [];
  obj.questions.forEach((q: any, i: number) => {
    const row = i + 1;
    const config = q?.type && typeof q.type === 'object' ? q.type : q?.config;
    const parsed = QuestionConfigSchema.safeParse(config);
    if (typeof q?.prompt !== 'string' || !q.prompt.trim()) return errors.push({ row, message: 'question has no prompt' });
    if (!parsed.success) return errors.push({ row, message: `${q.prompt.slice(0, 40)}: ${friendlyIssue(config?.type, parsed.error.issues[0])}` });
    const imageUrl = typeof q.imageUrl === 'string' ? q.imageUrl.trim() : '';
    if (imageUrl && !isHttpsImageUrl(imageUrl)) return errors.push({ row, message: `${q.prompt.slice(0, 40)}: image must be an https:// link` });
    questions.push({
      prompt: q.prompt.trim(),
      timeLimitSec: Number.isFinite(q.timeLimitSec) ? q.timeLimitSec : 20,
      points: Number.isFinite(q.points) ? q.points : 1000,
      type: parsed.data,
      ...(imageUrl ? { imageUrl } : {}),
    });
  });
  return { title: typeof obj.title === 'string' ? obj.title : undefined, questions, errors };
}

export function parseQuizText(text: string): ParseResult {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') ? parseJson(t) : parseSpreadsheet(text);
}
