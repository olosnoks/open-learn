import { describe, it, expect } from 'vitest';
import {
  draftSnapshot, duplicateQuestion, insertAfter, isValidImageUrl, moveQuestion,
  POINTS_PRESETS, TIME_PRESETS, toApiQuestion, type EditorQuestion,
} from '../../src/features/quiz-editor/questionList';
import { formatUpdated } from '../../src/features/quiz-editor/format';

const quizQ = (prompt: string): EditorQuestion => ({
  id: 'row-1', type: 'quiz', prompt, timeLimitSec: 20, points: 1000,
  config: {
    type: 'quiz',
    choices: [{ id: 'a', label: 'A', isCorrect: true }, { id: 'b', label: 'B', isCorrect: false }],
  },
});

describe('moveQuestion', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves an item up and down', () => {
    expect(moveQuestion(list, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveQuestion(list, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('returns the same array for no-op or out-of-range moves and never mutates', () => {
    expect(moveQuestion(list, 1, 1)).toBe(list);
    expect(moveQuestion(list, -1, 0)).toBe(list);
    expect(moveQuestion(list, 0, 4)).toBe(list);
    moveQuestion(list, 0, 1);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('insertAfter', () => {
  it('inserts right after the index, clamping to the ends', () => {
    expect(insertAfter(['a', 'b'], 0, 'x')).toEqual(['a', 'x', 'b']);
    expect(insertAfter(['a', 'b'], 1, 'x')).toEqual(['a', 'b', 'x']);
    expect(insertAfter(['a', 'b'], 9, 'x')).toEqual(['a', 'b', 'x']);
    expect(insertAfter(['a', 'b'], -5, 'x')).toEqual(['x', 'a', 'b']);
  });
});

describe('duplicateQuestion', () => {
  it('drops the row id, deep-copies, and mints new choice ids', () => {
    let n = 0;
    const src = quizQ('Pick');
    const copy = duplicateQuestion(src, () => `new-${++n}`);
    expect(copy.id).toBeUndefined();
    expect(copy.prompt).toBe('Pick');
    expect(copy.config.choices.map((c: any) => c.id)).toEqual(['new-1', 'new-2']);
    expect(copy.config.choices.map((c: any) => [c.label, c.isCorrect])).toEqual([['A', true], ['B', false]]);
    // The source is untouched.
    expect(src.config.choices.map((c: any) => c.id)).toEqual(['a', 'b']);
    copy.config.choices[0].label = 'changed';
    expect(src.config.choices[0].label).toBe('A');
  });

  it('remaps a puzzle correctOrder to the new item ids', () => {
    let n = 0;
    const src: EditorQuestion = {
      type: 'puzzle', prompt: 'Order', timeLimitSec: 30, points: 1000, imageUrl: 'https://x.test/p.png',
      config: {
        type: 'puzzle',
        items: [{ id: 'i1', label: 'One' }, { id: 'i2', label: 'Two' }, { id: 'i3', label: 'Three' }],
        correctOrder: ['i3', 'i1', 'i2'],
      },
    };
    const copy = duplicateQuestion(src, () => `n${++n}`);
    expect(copy.config.items.map((i: any) => i.id)).toEqual(['n1', 'n2', 'n3']);
    expect(copy.config.correctOrder).toEqual(['n3', 'n1', 'n2']);
    expect(copy.imageUrl).toBe('https://x.test/p.png');
  });

  it('leaves configs without ids alone', () => {
    const copy = duplicateQuestion({
      type: 'true_false', prompt: 'TF', timeLimitSec: 10, points: 0, config: { type: 'true_false', correct: false },
    });
    expect(copy.config).toEqual({ type: 'true_false', correct: false });
  });
});

describe('isValidImageUrl', () => {
  it('accepts empty and https, rejects everything else', () => {
    expect(isValidImageUrl('')).toBe(true);
    expect(isValidImageUrl(undefined)).toBe(true);
    expect(isValidImageUrl('  https://example.com/a.png ')).toBe(true);
    expect(isValidImageUrl('http://example.com/a.png')).toBe(false);
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false);
    expect(isValidImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isValidImageUrl('example.com/a.png')).toBe(false);
    expect(isValidImageUrl(`https://e.com/${'a'.repeat(2048)}`)).toBe(false);
  });
});

describe('draftSnapshot', () => {
  it('ignores row ids and treats a missing image like an empty one', () => {
    const a = { title: 'T', description: '', questions: [quizQ('P')] };
    const b = { title: 'T', description: '', questions: [{ ...quizQ('P'), id: 'other', imageUrl: '' }] };
    expect(draftSnapshot(a)).toBe(draftSnapshot(b));
    expect(draftSnapshot(a)).not.toBe(draftSnapshot({ ...a, title: 'T2' }));
    expect(draftSnapshot(a)).not.toBe(draftSnapshot({ ...a, questions: [{ ...quizQ('P'), points: 0 }] }));
  });
});

describe('toApiQuestion', () => {
  it('puts the config under "type" and normalises the image to null', () => {
    expect(toApiQuestion(quizQ('P'))).toEqual({
      type: quizQ('P').config, prompt: 'P', timeLimitSec: 20, points: 1000, imageUrl: null,
    });
    expect(toApiQuestion({ ...quizQ('P'), imageUrl: '  https://a.test/i.jpg ' }).imageUrl).toBe('https://a.test/i.jpg');
  });
});

describe('presets', () => {
  it('match Kahoot quick picks', () => {
    expect([...TIME_PRESETS]).toEqual([5, 10, 20, 30, 60, 90, 120, 240]);
    expect(POINTS_PRESETS.map((p) => p.value)).toEqual([1000, 2000, 0]);
  });
});

describe('formatUpdated', () => {
  const now = Date.UTC(2026, 0, 20, 12, 0, 0);
  it('is relative up to two weeks, then a date', () => {
    expect(formatUpdated(now - 10_000, now)).toBe('Just now');
    expect(formatUpdated(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatUpdated(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatUpdated(now - 24 * 3_600_000, now)).toBe('1 day ago');
    expect(formatUpdated(now - 5 * 86_400_000, now)).toBe('5 days ago');
    expect(formatUpdated(now - 30 * 86_400_000, now)).toBe(new Date(now - 30 * 86_400_000).toLocaleDateString());
  });
});
