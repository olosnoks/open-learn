import { test, expect, type Page } from '@playwright/test';
import { createQuiz, registerHost, type QuizInput } from './helpers';

/** Sidebar entries are buttons named "Q<n> · <type><prompt>". */
const questionTabs = (page: Page) => page.getByRole('button', { name: /^Q\d+ · / });
const questionTab = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^Q${n} · `) });

type ApiQuiz = {
  id: string;
  title: string;
  description: string | null;
  questions: { type: string; prompt: string; timeLimitSec: number; points: number; config: any }[];
};

const threeQuestionQuiz = (title: string): QuizInput => ({
  title,
  questions: [
    { prompt: 'Keep me 1', type: { type: 'true_false', correct: true } },
    { prompt: 'Drop me', type: { type: 'true_false', correct: false } },
    { prompt: 'Keep me 2', type: { type: 'type_answer', acceptedAnswers: ['yes'], caseSensitive: false } },
  ],
});

test('create a quiz with four question types; values persist across reload and in the API', async ({ browser }) => {
  const { context, page } = await registerHost(browser);
  const title = `E2E editor quiz ${Date.now()}`;

  await page.goto('/quizzes/new');
  await page.getByLabel('Quiz title').fill(title);
  await page.getByLabel('Description').fill('Made by the editor e2e test');

  // Q1: quiz (single answer) — relabel both choices, mark the 2nd correct, tweak time/points.
  await expect(questionTabs(page)).toHaveCount(1);
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('quiz');
  await page.getByLabel('Prompt').fill('Capital of France?');
  await page.getByLabel('Time limit (s)').fill('30');
  await page.getByLabel('Points').fill('500');
  await page.getByLabel('Choice 1', { exact: true }).fill('Berlin');
  await page.getByLabel('Choice 2', { exact: true }).fill('Paris');
  await page.getByRole('button', { name: 'Mark choice 2 correct' }).click();
  await expect(page.getByRole('button', { name: 'Mark choice 2 correct' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mark choice 1 correct' })).toHaveAttribute('aria-pressed', 'false');

  // Q2: true/false with False correct.
  await page.getByRole('button', { name: '+ Add question' }).click();
  await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption('true_false');
  await page.getByLabel('Prompt').fill('The sun is cold.');
  await page.getByRole('button', { name: 'False', exact: true }).click();
  await expect(page.getByRole('button', { name: 'False', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Q3: type answer.
  await page.getByRole('button', { name: '+ Add question' }).click();
  await expect(page.getByRole('heading', { name: 'Question 3' })).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption('type_answer');
  await page.getByLabel('Prompt').fill('Largest planet?');
  await page.getByLabel('Answer variant 1').fill('Jupiter');

  // Q4: puzzle with the default 3 items relabelled.
  await page.getByRole('button', { name: '+ Add question' }).click();
  await expect(page.getByRole('heading', { name: 'Question 4' })).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption('puzzle');
  await page.getByLabel('Prompt').fill('Order smallest to largest');
  await expect(page.getByLabel(/^Item \d+$/)).toHaveCount(3);
  await page.getByLabel('Item 1').fill('Mercury');
  await page.getByLabel('Item 2').fill('Earth');
  await page.getByLabel('Item 3').fill('Saturn');

  await expect(questionTabs(page)).toHaveCount(4);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]{36}$/);
  const quizId = page.url().split('/').pop()!;

  // Reload: the editor shows exactly what was saved.
  await page.reload();
  await expect(page.getByLabel('Quiz title')).toHaveValue(title);
  await expect(page.getByLabel('Description')).toHaveValue('Made by the editor e2e test');
  await expect(questionTabs(page)).toHaveCount(4);
  await expect(questionTab(page, 1)).toContainText('quiz');
  await expect(questionTab(page, 2)).toContainText('true_false');
  await expect(questionTab(page, 3)).toContainText('type_answer');
  await expect(questionTab(page, 4)).toContainText('puzzle');

  await questionTab(page, 1).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('quiz');
  await expect(page.getByLabel('Prompt')).toHaveValue('Capital of France?');
  await expect(page.getByLabel('Time limit (s)')).toHaveValue('30');
  await expect(page.getByLabel('Points')).toHaveValue('500');
  await expect(page.getByLabel('Choice 1', { exact: true })).toHaveValue('Berlin');
  await expect(page.getByLabel('Choice 2', { exact: true })).toHaveValue('Paris');
  await expect(page.getByRole('button', { name: 'Mark choice 1 correct' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Mark choice 2 correct' })).toHaveAttribute('aria-pressed', 'true');

  await questionTab(page, 2).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('true_false');
  await expect(page.getByLabel('Prompt')).toHaveValue('The sun is cold.');
  await expect(page.getByRole('button', { name: 'False', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'True', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await questionTab(page, 3).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('type_answer');
  await expect(page.getByLabel('Prompt')).toHaveValue('Largest planet?');
  await expect(page.getByLabel('Answer variant 1')).toHaveValue('Jupiter');

  await questionTab(page, 4).click();
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('puzzle');
  await expect(page.getByLabel('Prompt')).toHaveValue('Order smallest to largest');
  await expect(page.getByLabel('Item 1')).toHaveValue('Mercury');
  await expect(page.getByLabel('Item 2')).toHaveValue('Earth');
  await expect(page.getByLabel('Item 3')).toHaveValue('Saturn');

  // The stored config is what the game engine scores against.
  const res = await context.request.get(`/api/quizzes/${quizId}`);
  expect(res.status()).toBe(200);
  const quiz = (await res.json()) as ApiQuiz;
  expect(quiz.title).toBe(title);
  expect(quiz.description).toBe('Made by the editor e2e test');
  expect(quiz.questions.map((q) => q.type)).toEqual(['quiz', 'true_false', 'type_answer', 'puzzle']);
  expect(quiz.questions.map((q) => q.prompt)).toEqual([
    'Capital of France?', 'The sun is cold.', 'Largest planet?', 'Order smallest to largest',
  ]);

  const [q1, q2, q3, q4] = quiz.questions;
  expect(q1.timeLimitSec).toBe(30);
  expect(q1.points).toBe(500);
  expect(q1.config.type).toBe('quiz');
  expect(q1.config.choices.map((c: any) => [c.label, c.isCorrect])).toEqual([['Berlin', false], ['Paris', true]]);

  expect(q2.timeLimitSec).toBe(20);
  expect(q2.points).toBe(1000);
  expect(q2.config).toEqual({ type: 'true_false', correct: false });

  expect(q3.config).toEqual({ type: 'type_answer', acceptedAnswers: ['Jupiter'], caseSensitive: false });

  expect(q4.config.type).toBe('puzzle');
  expect(q4.config.items.map((i: any) => i.label)).toEqual(['Mercury', 'Earth', 'Saturn']);
  expect(q4.config.correctOrder).toEqual(q4.config.items.map((i: any) => i.id));
  expect(new Set(q4.config.correctOrder).size).toBe(3);
});

test('edit: rename and remove a question, then save', async ({ browser }) => {
  const { context, page } = await registerHost(browser);
  const stamp = Date.now();
  const quizId = await createQuiz(context, threeQuestionQuiz(`E2E edit me ${stamp}`));
  const newTitle = `E2E edited ${stamp}`;

  await page.goto(`/quizzes/${quizId}`);
  await expect(page.getByLabel('Quiz title')).toHaveValue(`E2E edit me ${stamp}`);
  await expect(questionTabs(page)).toHaveCount(3);
  await page.getByLabel('Quiz title').fill(newTitle);

  await questionTab(page, 2).click();
  await expect(page.getByLabel('Prompt')).toHaveValue('Drop me');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(questionTabs(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Drop me/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
  await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name: `E2E edit me ${stamp}` })).toHaveCount(0);

  // Re-open from the list.
  await page.getByRole('listitem').filter({ hasText: newTitle }).getByRole('button', { name: 'Edit' }).click();
  await expect(page).toHaveURL(new RegExp(`/quizzes/${quizId}$`));
  await expect(page.getByLabel('Quiz title')).toHaveValue(newTitle);
  await expect(questionTabs(page)).toHaveCount(2);
  await expect(questionTab(page, 1)).toContainText('Keep me 1');
  await expect(questionTab(page, 2)).toContainText('Keep me 2');

  const quiz = (await (await context.request.get(`/api/quizzes/${quizId}`)).json()) as ApiQuiz;
  expect(quiz.title).toBe(newTitle);
  expect(quiz.questions.map((q) => q.prompt)).toEqual(['Keep me 1', 'Keep me 2']);
});

test('validation: an empty accepted answer shows an error and does not navigate', async ({ browser }) => {
  const { context, page } = await registerHost(browser);
  const title = `E2E invalid ${Date.now()}`;

  await page.goto('/quizzes/new');
  await page.getByLabel('Quiz title').fill(title);
  await page.getByLabel('Type', { exact: true }).selectOption('type_answer');
  await page.getByLabel('Prompt').fill('Say something');
  await expect(page.getByLabel('Answer variant 1')).toHaveValue('');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('acceptedAnswers');
  await expect(page).toHaveURL(/\/quizzes\/new$/);
  // The draft is still there to fix.
  await expect(page.getByLabel('Quiz title')).toHaveValue(title);

  const list = (await (await context.request.get('/api/quizzes')).json()) as { title: string }[];
  expect(list.map((q) => q.title)).not.toContain(title);

  // Fixing it clears the error and saves.
  await page.getByLabel('Answer variant 1').fill('hello');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('delete a quiz from the editor', async ({ browser }) => {
  const { context, page } = await registerHost(browser);
  const title = `E2E delete me ${Date.now()}`;
  const quizId = await createQuiz(context, threeQuestionQuiz(title));

  await page.goto(`/quizzes/${quizId}`);
  await expect(page.getByLabel('Quiz title')).toHaveValue(title);

  let dialogMessage = '';
  page.once('dialog', (d) => {
    dialogMessage = d.message();
    void d.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
  expect(dialogMessage).toContain('Delete this quiz');
  await expect(page.getByText('No quizzes yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);

  expect((await context.request.get(`/api/quizzes/${quizId}`)).status()).toBe(404);
});

test("a second host can't see or touch the first host's quiz", async ({ browser }) => {
  const owner = await registerHost(browser);
  const title = `E2E private ${Date.now()}`;
  const quizId = await createQuiz(owner.context, threeQuestionQuiz(title));

  await owner.page.goto('/quizzes');
  await expect(owner.page.getByRole('heading', { name: title })).toBeVisible();

  const other = await registerHost(browser);
  await other.page.goto('/quizzes');
  await expect(other.page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
  await expect(other.page.getByText('No quizzes yet.')).toBeVisible();
  await expect(other.page.getByRole('heading', { name: title })).toHaveCount(0);

  expect((await other.context.request.get(`/api/quizzes/${quizId}`)).status()).toBe(404);
  const list = (await (await other.context.request.get('/api/quizzes')).json()) as { id: string }[];
  expect(list.map((q) => q.id)).not.toContain(quizId);

  // Opening the editor by URL shows an error rather than the quiz.
  await other.page.goto(`/quizzes/${quizId}`);
  await expect(other.page.getByRole('alert')).toContainText('404');
  await expect(other.page.getByLabel('Quiz title')).toHaveValue('');

  // Writes are scoped too: the owner's quiz survives the other host's PUT and DELETE.
  const put = await other.context.request.put(`/api/quizzes/${quizId}`, { data: threeQuestionQuiz('hijacked') });
  expect(put.status()).toBe(404);
  await other.context.request.delete(`/api/quizzes/${quizId}`);
  const after = await owner.context.request.get(`/api/quizzes/${quizId}`);
  expect(after.status()).toBe(200);
  expect(((await after.json()) as ApiQuiz).title).toBe(title);
});
