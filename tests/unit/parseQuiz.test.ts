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

  it('reports invalid JSON instead of throwing', () => {
    expect(parseQuizText('{ nope').errors[0].message).toMatch(/Not valid JSON/);
  });
});
