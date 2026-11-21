import { test, expect } from '@playwright/test';
import { registerHost } from './helpers';

test('import a quiz from a spreadsheet file, then play-ready in the editor', async ({ browser }) => {
  const { context, page } = await registerHost(browser);
  await page.goto('/quizzes');
  await page.getByRole('button', { name: 'Import from spreadsheet' }).first().click();
  await expect(page).toHaveURL(/\/quizzes\/import$/);

  const csv = [
    'question,type,answer1,answer2,answer3,correct,time,points,image',
    'Capital of France?,,Paris,Rome,Madrid,1,20,1000,https://placehold.co/200x100.png',
    'Pick the primes,multi,2,4,7,"1,3",30,1000,',
    'Sun is a star,truefalse,,,,true,10,500,',
    'Broken row,,OnlyOne,,,1,20,1000,',
  ].join('\n');
  await page.getByLabel(/Upload a file/).setInputFiles({
    name: 'Science-week.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });

  // Title comes from the file name; preview + skipped-row report appear.
  await expect(page.getByLabel('Quiz title')).toHaveValue('Science week');
  await expect(page.getByText('Preview: 3 questions')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Row 5');
  await expect(page.getByText('✓ Paris')).toBeVisible();

  await page.getByRole('button', { name: 'Import 3 questions' }).click();
  await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  const res = await context.request.get(`/api/quizzes/${id}`);
  const quiz = await res.json();
  expect(quiz.title).toBe('Science week');
  expect(quiz.questions.map((q: any) => q.type)).toEqual(['quiz', 'multi_select', 'true_false']);
  expect(quiz.questions[1].config.choices.filter((c: any) => c.isCorrect).map((c: any) => c.label)).toEqual(['2', '7']);
  expect(quiz.questions[2].config).toEqual({ type: 'true_false', correct: true });
  expect(quiz.questions.map((q: any) => q.imageUrl)).toEqual(['https://placehold.co/200x100.png', null, null]);

  // It's immediately usable: it shows up when starting a game.
  await page.goto('/host/create');
  await expect(page.getByLabel('Choose a quiz').locator('option', { hasText: 'Science week' })).toHaveCount(1);
  await context.close();
});
