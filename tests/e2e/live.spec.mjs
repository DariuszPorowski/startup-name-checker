// Smoke test against the real services. Run with LIVE_URL=<deployed site> to also verify CORS from the real origin.
import { test, expect } from '@playwright/test';

async function checkName(page, name) {
  await page.goto(`./?name=${name}`);
  await expect(page.locator('.row')).toHaveCount(10);
  await expect(page.locator('.row[data-status="checking"]')).toHaveCount(0, { timeout: 100_000 });
  const rows = await page.locator('.row').evaluateAll((els) =>
    els.map((el) => ({
      id: el.dataset.platform,
      status: el.dataset.status,
      note: el.querySelector('.note').textContent,
      via: el.querySelector('.via').textContent,
    })),
  );
  console.log(`\n${name}:\n${rows.map((r) => `  ${r.id.padEnd(10)} ${r.status.padEnd(10)} ${r.note} ${r.via ? `(${r.via})` : ''}`).join('\n')}`);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

// GitHub's unauthenticated API limit is shared by everyone on the same IP, which is common on CI runners.
const rateLimited = (r) => r.status === 'unknown' && /limit/i.test(r.note);

test('a well-known name is reported as taken', async ({ page }) => {
  const rows = await checkName(page, 'google');
  for (const id of ['com', 'app', 'x']) expect(rows[id].status, id).toBe('taken');
  if (!rateLimited(rows.github)) expect(rows.github.status, 'github').toBe('taken');
  for (const r of Object.values(rows)) {
    expect(['available', 'invalid', 'checking'], `${r.id} must not be ${r.status}`).not.toContain(r.status);
  }
});

test('a random name is reported as available', async ({ page }) => {
  const name = `zq${Date.now().toString(36)}x`;
  const rows = await checkName(page, name);
  for (const id of ['com', 'app', 'x']) expect(rows[id].status, id).toBe('available');
  if (!rateLimited(rows.github)) expect(rows.github.status, 'github').toBe('available');
  for (const r of Object.values(rows)) {
    expect(['taken', 'invalid', 'checking'], `${r.id} must not be ${r.status}`).not.toContain(r.status);
  }
});
