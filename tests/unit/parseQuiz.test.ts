import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseQuizText, parseDelimited, TEMPLATE_CSV } from '../../src/features/quiz-import/parseQuiz';

const correctLabels = (q: any) => q.type.choices.filter((c: any) => c.isCorrect).map((c: any) => c.label);

describe('parseDelimited', () => {
  it('handles quotes, doubled quotes, embedded commas and newlines', () => {
    expect(parseDelimited('a,"b, c","say ""hi""","multi\nline"\r\nx,y', ','))
      .toEqual([['a', 'b, c', 'say "hi"', 'multi\nline'], ['x', 'y']]);
  });
});

describe('parseQuizText (spreadsheet)', () => {
  it('parses every row of the downloadable template without errors', () => {
    const r = parseQuizText(TEMPLATE_CSV);
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.type.type))
      .toEqual(['quiz', 'multi_select', 'true_false', 'type_answer', 'puzzle', 'poll']);
    expect(correctLabels(r.questions[0])).toEqual(['Paris']);
    expect(correctLabels(r.questions[1])).toEqual(['2', '7']);
    expect(r.questions[2].type).toEqual({ type: 'true_false', correct: true });
    expect(r.questions[3].type).toMatchObject({ acceptedAnswers: ['H2O', 'H₂O'] });
    const puzzle = r.questions[4].type as any;
    expect(puzzle.items.map((i: any) => i.label)).toEqual(['Mercury', 'Venus', 'Earth', 'Mars']);
    expect(puzzle.correctOrder).toEqual(puzzle.items.map((i: any) => i.id));
    expect(r.questions[0]).toMatchObject({ timeLimitSec: 20, points: 1000 });
    expect(r.questions[5].points).toBe(0);
    // The image column: set on the puzzle row, absent (not '') everywhere else.
    expect(r.questions[4].imageUrl).toBe('https://placehold.co/600x400');
    expect(r.questions[0]).not.toHaveProperty('imageUrl');
  });

  it('reads an optional image / image_url column and rejects non-https links', () => {
    const r = parseQuizText([
      'question,answer1,answer2,correct,image_url',
      'With picture,A,B,1,https://cdn.example.com/pic.png',
      'No picture,A,B,1,',
      'Insecure,A,B,1,http://cdn.example.com/pic.png',
      'Not a link,A,B,1,pic.png',
    ].join('\n'));
    expect(r.questions.map((q) => q.prompt)).toEqual(['With picture', 'No picture']);
    expect(r.questions[0].imageUrl).toBe('https://cdn.example.com/pic.png');
    expect(r.questions[1]).not.toHaveProperty('imageUrl');
    expect(r.errors.map((e) => e.row)).toEqual([4, 5]);
    expect(r.errors[0].message).toMatch(/https/);
  });

  it('accepts "picture" and "Image URL" as header aliases', () => {
    const r = parseQuizText('Question\tAnswer 1\tAnswer 2\tCorrect\tImage URL\nQ\tA\tB\t1\thttps://x.test/i.jpg');
    expect(r.errors).toEqual([]);
    expect(r.questions[0].imageUrl).toBe('https://x.test/i.jpg');
    const r2 = parseQuizText('question,answer1,answer2,correct,picture\nQ,A,B,1,https://x.test/i.jpg');
    expect(r2.questions[0].imageUrl).toBe('https://x.test/i.jpg');
  });

  it('accepts tab-separated rows pasted from Google Sheets / Excel, any column order', () => {
    const tsv = 'Correct\tQuestion\tOption 1\tOption 2\tOption 3\n' +
                'B\t2 + 2 = ?\t3\t4\t5\n' +
                'Blue\tColour of the sky?\tGreen\tBlue\t\n';
    const r = parseQuizText(tsv);
    expect(r.errors).toEqual([]);
    expect(correctLabels(r.questions[0])).toEqual(['4']);  // letter B
    expect(correctLabels(r.questions[1])).toEqual(['Blue']); // answer text
    expect(r.questions[1].type).toMatchObject({ choices: [{ label: 'Green' }, { label: 'Blue' }] });
  });

  it('infers true/false and multi when type is blank', () => {
    const r = parseQuizText('question,answer1,answer2,answer3,correct\nIs water wet?,,,,yes\nPick evens,2,3,4,"1,3"');
    expect(r.errors).toEqual([]);
    expect(r.questions[0].type).toEqual({ type: 'true_false', correct: true });
    expect(r.questions[1].type.type).toBe('multi_select');
  });

  it('reports bad rows with spreadsheet row numbers and keeps the good ones', () => {
    const r = parseQuizText([
      'question,type,answer1,answer2,correct,time',
      'Good one,quiz,A,B,1,20',
      ',quiz,A,B,1,20',
      'No key,quiz,A,B,,20',
      'Bad number,quiz,A,B,5,20',
      'Bad type,essay,A,B,1,20',
      'One answer,quiz,A,,1,20',
      'Too fast,quiz,A,B,1,2',
      'Two right,quiz,A,B,"1,2",20',
    ].join('\n'));
    expect(r.questions.map((q) => q.prompt)).toEqual(['Good one']);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(r.errors[1].message).toMatch(/correct answer/);
    expect(r.errors[3].message).toMatch(/unknown type/);
    expect(r.errors[4].message).toMatch(/2–4 answers/);
  });

  it('imports the shipped Security+ practice set without skipping a row', () => {
    const csv = readFileSync(new URL('../../quizzes/security-plus-practice-set-1.csv', import.meta.url), 'utf8');
    const r = parseQuizText(csv);
    expect(r.errors).toEqual([]);
    expect(r.questions.length).toBeGreaterThanOrEqual(10);
    expect(r.questions.every((q) => q.type.type === 'quiz')).toBe(true);
    expect(r.questions.every((q) => !('imageUrl' in q))).toBe(true);
  });

  it('requires a header row with a question column', () => {
    const r = parseQuizText('What is 1+1?,1,2,3\n');
    expect(r.questions).toEqual([]);
    expect(r.errors[0].message).toMatch(/header/);
  });

  it('handles semicolon-separated CSV (European Excel)', () => {
    const r = parseQuizText('question;answer1;answer2;correct\nCapital of Spain?;Madrid;Lisbon;1');
    expect(r.errors).toEqual([]);
    expect(correctLabels(r.questions[0])).toEqual(['Madrid']);
  });
});

describe('parseQuizText (JSON)', () => {
  it('accepts the API payload shape and reports invalid questions', () => {
    const r = parseQuizText(JSON.stringify({
      title: 'From JSON',
      questions: [
        { prompt: 'Slider', timeLimitSec: 30, points: 500, type: { type: 'slider', min: 0, max: 10, step: 1, correct: 5, tolerance: 1 } },
        { prompt: 'Broken', type: { type: 'quiz', choices: [] } },
      ],
    }));
    expect(r.title).toBe('From JSON');
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]).toMatchObject({ prompt: 'Slider', timeLimitSec: 30, points: 500 });
    expect(r.errors).toHaveLength(1);
  });

  it('keeps imageUrl from JSON when it is https, reports it otherwise', () => {
    const r = parseQuizText(JSON.stringify({ questions: [
      { prompt: 'Pic', imageUrl: 'https://x.test/a.png', type: { type: 'true_false', correct: true } },
      { prompt: 'Bad pic', imageUrl: 'ftp://x.test/a.png', type: { type: 'true_false', correct: true } },
    ] }));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].imageUrl).toBe('https://x.test/a.png');
    expect(r.errors[0].message).toMatch(/https/);
  });

  it('reports invalid JSON instead of throwing', () => {
    expect(parseQuizText('{ nope').errors[0].message).toMatch(/Not valid JSON/);
  });
});
