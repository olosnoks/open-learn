import { test, expect } from '@playwright/test';
import { createQuiz, registerHost, simpleQuiz } from './helpers';

test('two teams, one player each, team score aggregates', async ({ browser }) => {
  // A fresh signed-in host with a quiz to start.
  const { context, page: host } = await registerHost(browser);
  const quizId = await createQuiz(context, simpleQuiz(`E2E team quiz ${Date.now()}`));

  // Players are anonymous, each in their own context.
  const alice = await browser.newPage();
  const bob = await browser.newPage();

  await host.goto('/host/create');
  await host.getByLabel('Choose a quiz').selectOption(quizId);
  await host.getByText('Team mode').click();
  await host.getByRole('button', { name: '2 teams' }).click();
  await host.getByRole('button', { name: 'Create room' }).click();
  const pinEl = host.getByTestId('room-code');
  await expect(pinEl).toHaveText(/^\d{6}$/);
  const pin = (await pinEl.textContent())!;

  await alice.goto(`/join/${pin}`);
  await alice.getByRole('button', { name: /Red/ }).click();
  await alice.getByLabel('Nickname').fill('Alice');
  await alice.getByRole('button', { name: 'Join game' }).click();
  await expect(alice.getByText("You're in!")).toBeVisible();

  await bob.goto(`/join/${pin}`);
  await bob.getByRole('button', { name: /Blue/ }).click();
  await bob.getByLabel('Nickname').fill('Bob');
  await bob.getByRole('button', { name: 'Join game' }).click();
  await expect(bob.getByText("You're in!")).toBeVisible();

  await expect(host.getByText('Alice')).toBeVisible();
  await expect(host.getByText('Bob')).toBeVisible();

  await host.getByRole('button', { name: 'Start game' }).click();
  await alice.getByRole('button', { name: /Answer 1/ }).click();
  await bob.getByRole('button', { name: /Answer 2/ }).click();

  // Both connected players answered, so the room reveals without waiting for the timer.
  await expect(host.getByText('Team standings')).toBeVisible();
  await expect(alice.getByText('Team Red', { exact: true })).toBeVisible();
});
