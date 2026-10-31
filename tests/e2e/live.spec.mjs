// Smoke test against the real services. Run with LIVE_URL=<deployed site> to also verify CORS from the real origin.
import { test, expect } from '@playwright/test';
import { PLATFORMS, TLDS } from '../../site/checker.js';

const SOCIAL = PLATFORMS.filter((p) => p.group === 'social').map((p) => p.id);
const ALL = `domains=${TLDS.join(',')}&social=${SOCIAL.join(',')}`;

async function checkName(page, name, query = ALL) {
  await page.goto(`./?name=${name}&${query}`);
  const expected = query.split('&').flatMap((part) => part.split('=')[1].split(',')).filter(Boolean).length;
  await expect(page.locator('.row')).toHaveCount(expected);
  await expect(page.locator('.row[data-status="checking"]')).toHaveCount(0, { timeout: 100_000 });
  const rows = await page.locator('.row').evaluateAll((els) =>
    els.map((el) => ({
      id: el.dataset.platform,
      status: el.dataset.status,
      note: el.querySelector('.note').textContent,
      via: el.querySelector('.via').textContent,
    })),
  );
  console.log(`\n${name}:\n${rows.map((r) => `  ${r.id.padEnd(11)} ${r.status.padEnd(10)} ${r.note} ${r.via ? `(${r.via})` : ''}`).join('\n')}`);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

// GitHub's unauthenticated API limit is shared by everyone on the same IP, which is common on CI runners.
const rateLimited = (r) => r.status === 'unknown' && /limit/i.test(r.note);

// Registries and official APIs must give the exact answer. Rate-limited services and page readers (Pinterest, Jina,
// Unavatar, ivr.fi) may refuse shared CI networks, so for those only a wrong answer fails the test.
const EXACT = [...TLDS, 'x', 'bluesky', 'discord', 'mastodon', 'tumblr', 'hackernews'];

test('a well-known name is reported as taken', async ({ page }) => {
  const rows = await checkName(page, 'google');
  for (const id of [...TLDS, 'x', 'bluesky']) expect(rows[id].status, id).toBe('taken');
  if (!rateLimited(rows.github)) expect(rows.github.status, 'github').toBe('taken');
  for (const r of Object.values(rows)) {
    expect(['invalid', 'checking'], `${r.id} must not be ${r.status}`).not.toContain(r.status);
  }
  for (const id of ['instagram', 'youtube', 'tiktok', 'threads', 'facebook', 'linkedin']) {
    expect(['available'], `${id} must not be ${rows[id].status}`).not.toContain(rows[id].status);
  }
});

test('a random name is reported as available', async ({ page }) => {
  const name = `zq${Date.now().toString(36)}x`;
  const rows = await checkName(page, name);
  for (const id of EXACT) {
    // .co and .so are checked through DNS only, and Hacker News can't tell a free name from an unused one.
    const expected = { co: 'likely', so: 'likely', hackernews: 'likely' }[id] || 'available';
    expect(rows[id].status, id).toBe(expected);
  }
  if (!rateLimited(rows.github)) expect(rows.github.status, 'github').toBe('available');
  for (const r of Object.values(rows)) {
    expect(['taken', 'invalid', 'checking'], `${r.id} must not be ${r.status}`).not.toContain(r.status);
  }
});

test('a name with a domain ending is checked as that domain and adapted for each platform', async ({ page }) => {
  // booking.com is the domain itself, booking_com on X, booking-com on GitHub, booking.com on TikTok and LinkedIn, and
  // bookingcom on Facebook. All of them exist.
  const rows = await checkName(page, 'booking.com', 'domains=com&social=x,github,tiktok,facebook,linkedin');
  for (const id of ['com', 'x']) expect(rows[id].status, id).toBe('taken');
  if (!rateLimited(rows.github)) expect(rows.github.status, 'github').toBe('taken');
  for (const id of ['tiktok', 'facebook', 'linkedin']) expect(['taken', 'unknown', 'manual'], id).toContain(rows[id].status);
});

test('bluesky checks a name with a domain ending as that domain', async ({ page }) => {
  // GitHub uses its domain as its Bluesky handle.
  const taken = await checkName(page, 'github.com', 'domains=com&social=bluesky');
  expect(taken.bluesky.status).toBe('taken');
  const free = await checkName(page, `zq${Date.now().toString(36)}x.design`, 'domains=design&social=bluesky');
  expect(free.bluesky.status).toBe('available');
});

// Accounts that are known to exist, one per newer platform.
const KNOWN = {
  bluesky: 'google',
  reddit: 'spez',
  pinterest: 'pinterest',
  twitch: 'twitch',
  discord: 'discord-developers',
  telegram: 'telegram',
  mastodon: 'gargron',
  tumblr: 'staff',
  substack: 'platformer',
  hackernews: 'pg',
};

for (const [id, name] of Object.entries(KNOWN)) {
  test(`${id} finds the existing account "${name}"`, async ({ page }) => {
    const rows = await checkName(page, name, `domains=&social=${id}`);
    if (EXACT.includes(id)) expect(rows[id].status).toBe('taken');
    else expect(['taken', 'unknown', 'manual']).toContain(rows[id].status);
  });
}
