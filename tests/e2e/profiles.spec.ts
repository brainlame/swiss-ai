import { expect, test } from '@playwright/test';
import { signin } from './helpers';
const issue = '/issues/eeeeeeee-0000-4000-8000-000000000001';
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
});
test('profile settings update public attribution, pictures and private account menu, then delete an account without deleting its contributions', async ({
  page,
}) => {
  await signin(page, 'citizen@fixtures.invalid', '/settings');
  await page.getByLabel('First name', { exact: true }).fill('Jane');
  await page.getByLabel('Last name', { exact: true }).fill('Citizen');
  await page.getByLabel('Profile picture', { exact: true }).setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Profile saved.' }),
  ).toBeVisible();
  await expect(
    page.locator('.settings-page .profile-avatar img'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.locator('#account-menu')).toContainText('Jane Citizen');
  await expect(page.locator('#account-menu')).toContainText(
    'citizen@fixtures.invalid',
  );
  await expect(
    page
      .locator('#account-menu')
      .getByRole('link', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.goto(issue);
  await expect(page.locator('.detail-top')).toContainText('Jane Citizen');
  await expect(page.locator('.discussion-comment').first()).toContainText(
    'Jane Citizen',
  );
  await expect(
    page.locator('.discussion-comment').first().locator('.profile-avatar img'),
  ).toBeVisible();
  await page.goto('/settings');
  await page
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(page.getByLabel('Type DELETE to confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Type DELETE to confirm')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page
    .getByRole('button', { name: 'Permanently delete account', exact: true })
    .click();
  await expect(page).toHaveURL('/signin?accountDeleted=1');
  await expect(page.getByRole('status')).toContainText(
    'Your account has been deleted',
  );
  await page.goto(issue);
  await expect(page.locator('.detail-top')).toContainText('Deleted user');
  await expect(page.locator('.detail-top .profile-avatar svg')).toBeVisible();
  await expect(page.locator('.detail-top .profile-avatar img')).toHaveCount(0);
  // Another account votes normally to reveal the retained discussion.
  await signin(page, 'other@fixtures.invalid', issue);
  await page
    .getByRole('button', { name: 'Wanted reasons', exact: true })
    .click();
  await expect(page.locator('.discussion-comment').first()).toContainText(
    'Deleted user',
  );
  await expect(
    page.locator('.discussion-comment').first().locator('.profile-avatar svg'),
  ).toBeVisible();
});
test('settings requires sign-in and invalid pictures preserve entered names', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/signin\?next=%2Fsettings/);
  await signin(page, 'citizen@fixtures.invalid', '/settings');
  await page.getByLabel('First name', { exact: true }).fill('Jane');
  await page.getByLabel('Last name', { exact: true }).fill('Citizen');
  await page.getByLabel('Profile picture', { exact: true }).setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('not a supported image');
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue(
    'Jane',
  );
});
