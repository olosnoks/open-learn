import { test, expect } from '@playwright/test';
import { registerHost } from './helpers';

test('host routes redirect to login; register, log out and log back in via the UI', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page).toHaveURL(/\/login\?next=%2Fsessions$/);

  // Register through the UI; it should bring us back to `next`.
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/register\?next=%2Fsessions$/);
  const email = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
  await page.getByLabel('Display name').fill('UI Host');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-good-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByTestId('current-user')).toHaveText('UI Host');

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/quizzes');
  await expect(page).toHaveURL(/\/login\?next=%2Fquizzes$/);

  // Wrong password: generic error, no redirect.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');

  await page.getByLabel('Password').fill('a-good-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
  await expect(page.getByRole('heading', { name: 'Your quizzes' })).toBeVisible();
});

test('open redirects in ?next are ignored', async ({ browser }) => {
  const { page, user } = await registerHost(browser);
  await page.context().clearCookies();
  await page.goto('/login?next=//evil.example/x');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/quizzes$/);
});
