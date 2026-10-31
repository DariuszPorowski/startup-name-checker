import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkAll, normalizeName, validateInput, PLATFORMS, STATUS, TLDS } from '../site/checker.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (status) => new Response('<!doctype html><title>x</title>', { status, headers: { 'content-type': 'text/html' } });
const jina = (data) => json(200, { code: 200, status: 20000, data });
// What a browser reports for a CORS-blocked or unreachable response.
const blocked = () => new TypeError('Failed to fetch');

/** Fake fetch: the first route whose prefix matches the URL answers; anything else fails like a CORS error. */
function mockFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    for (const [prefix, answer] of routes) {
      if (url.startsWith(prefix)) {
        const res = typeof answer === 'function' ? answer(url) : answer;
        if (res instanceof Error) throw res;
        return res.clone();
      }
    }
    throw blocked();
  };
  fetch.calls = calls;
  return fetch;
}

async function check(ids, name, routes) {
  const list = [].concat(ids);
  const fetch = mockFetch(routes);
  const out = await checkAll(name, { fetch, platforms: PLATFORMS.filter((p) => list.includes(p.id)) });
  return { ...out[list.at(-1)], calls: fetch.calls };
}

describe('normalizeName', () => {
  for (const [input, expected] of [
    ['  AcmeRocket ', 'acmerocket'],
    ['@acme', 'acme'],
    ['Acme Rocket', 'acmerocket'],
    ['acme.com', 'acme'],
    ['acme.app', 'acme'],
    ['https://www.acme.com/', 'acme'],
    ['acme.io', 'acme'],
    ['https://acme.ai', 'acme'],
    ['acme.com.co', 'acme.com'],
    ['acme.dev', 'acme'],
    ['acme.cloud', 'acme'],
    ['acme.xyz', 'acme'],
    ['deno.land', 'deno.land'],
    [undefined, ''],
  ]) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => assert.equal(normalizeName(input), expected));
  }
});

describe('validateInput', () => {
  test('accepts a plain name', () => assert.equal(validateInput('acme_rocket.io-1'), null));
  test('rejects empty input', () => assert.match(validateInput(''), /enter a name/i));
  test('rejects symbols', () => assert.match(validateInput('acme!'), /only letters/i));
  test('rejects very long names', () => assert.match(validateInput('a'.repeat(64)), /63/));
});

describe('platform rules', () => {
  const invalidFor = async (name, ids = PLATFORMS.map((p) => p.id)) => {
    const out = await checkAll(name, { fetch: mockFetch([]), platforms: PLATFORMS.filter((p) => ids.includes(p.id)) });
    return Object.keys(out).filter((id) => out[id].status === STATUS.INVALID).sort();
  };

  test('underscores are not valid in domains and some platforms', async () => {
    const expected = [...TLDS, 'bluesky', 'discord', 'facebook', 'github', 'linkedin', 'substack', 'tumblr'].sort();
    assert.deepEqual(await invalidFor('acme_rocket'), expected);
  });

  test('hyphens are not valid on platforms that only allow letters, numbers, periods or underscores', async () => {
    const expected = ['facebook', 'instagram', 'mastodon', 'pinterest', 'telegram', 'threads', 'tiktok', 'twitch', 'x'];
    assert.deepEqual(await invalidFor('acme-rocket'), expected);
  });

  test('X and Hacker News handles are limited to 15 characters', async () => {
    assert.deepEqual(await invalidFor('acmerocketlaunch', ['x', 'hackernews', 'github']), ['hackernews', 'x']);
  });

  test('Bluesky handles are limited to 18 characters', async () => {
    assert.deepEqual(await invalidFor('acmerocketlaunches', ['bluesky']), []);
    assert.deepEqual(await invalidFor('acmerocketlaunchpad', ['bluesky']), ['bluesky']);
  });

  test('short names are rejected where platforms require a minimum length', async () => {
    const expected = ['bluesky', 'facebook', 'pinterest', 'reddit', 'telegram', 'twitch', 'youtube'];
    assert.deepEqual(await invalidFor('ab'), expected);
  });

  test('Telegram usernames must start with a letter', async () => {
    assert.deepEqual(await invalidFor('1acme', ['telegram', 'twitch']), ['telegram']);
  });

  test('IDN-style double hyphens are rejected for domains', async () => {
    const invalid = await invalidFor('ab--cd', [...TLDS]);
    assert.deepEqual(invalid, [...TLDS].sort());
  });
});

describe('defaults', () => {
  test('only .com and the original eight social platforms are selected by default', () => {
    const ids = PLATFORMS.filter((p) => p.defaultChecked).map((p) => p.id);
    assert.deepEqual(ids, ['com', 'instagram', 'x', 'github', 'youtube', 'tiktok', 'threads', 'facebook', 'linkedin']);
  });

  test('every domain ending is offered, in order', () => {
    const tlds = ['com', 'net', 'org', 'app', 'dev', 'io', 'co', 'ai', 'so', 'pro', 'cloud', 'tech', 'xyz'];
    assert.deepEqual(PLATFORMS.filter((p) => p.group === 'domains').map((p) => p.id), tlds);
  });

  test('platform ids are unique', () => {
    assert.equal(new Set(PLATFORMS.map((p) => p.id)).size, PLATFORMS.length);
  });
});

describe('domains', () => {
  test('.com is available when the registry has no record', async () => {
    const r = await check('com', 'acme', [['https://rdap.verisign.com/com/v1/domain/acme.com', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'Verisign RDAP');
  });

  test('.app is taken with its registration date', async () => {
    const body = { objectClassName: 'domain', events: [{ eventAction: 'registration', eventDate: '2018-05-01T12:00:00Z' }] };
    const r = await check('app', 'acme', [['https://pubapi.registry.google/rdap/domain/acme.app', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /2018-05-01/);
  });

  test('falls back to rdap.org when the registry is unreachable', async () => {
    const r = await check('com', 'acme', [['https://rdap.org/domain/acme.com', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'rdap.org');
  });

  test('falls back to DNS: NXDOMAIN means likely available', async () => {
    const r = await check('com', 'acme', [['https://dns.google/resolve?name=acme.com', json(200, { Status: 3 })]]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('is unknown when every source fails', async () => {
    const r = await check('com', 'acme', []);
    assert.equal(r.status, STATUS.UNKNOWN);
  });

  test('.net is checked at Verisign', async () => {
    const r = await check('net', 'acme', [['https://rdap.verisign.com/net/v1/domain/acme.net', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'Verisign RDAP');
  });

  for (const tld of ['io', 'ai', 'pro']) {
    test(`.${tld} is checked at Identity Digital`, async () => {
      const r = await check(tld, 'acme', [[`https://rdap.identitydigital.services/rdap/domain/acme.${tld}`, json(404, {})]]);
      assert.equal(r.status, STATUS.AVAILABLE);
      assert.equal(r.via, 'Identity Digital RDAP');
    });
  }

  for (const [tld, base, via] of [
    ['org', 'https://rdap.publicinterestregistry.org/rdap/', 'Public Interest Registry RDAP'],
    ['dev', 'https://pubapi.registry.google/rdap/', 'Google Registry RDAP'],
    ['cloud', 'https://rdap.registry.cloud/rdap/', '.cloud registry RDAP'],
    ['tech', 'https://rdap.radix.host/rdap/', 'Radix RDAP'],
    ['xyz', 'https://rdap.centralnic.com/xyz/', 'CentralNic RDAP'],
  ]) {
    test(`.${tld} is checked at its registry`, async () => {
      const free = await check(tld, 'acme', [[`${base}domain/acme.${tld}`, json(404, { errorCode: 404, title: 'Not Found' })]]);
      assert.equal(free.status, STATUS.AVAILABLE);
      assert.equal(free.via, via);
      const body = { objectClassName: 'domain', events: [{ eventAction: 'registration', eventDate: '2016-06-07T08:00:00Z' }] };
      const taken = await check(tld, 'acme', [[`${base}domain/acme.${tld}`, json(200, body)]]);
      assert.equal(taken.status, STATUS.TAKEN);
      assert.equal(taken.note, 'Registered since 2016-06-07');
    });

    test(`.${tld} falls back to rdap.org`, async () => {
      const r = await check(tld, 'acme', [[`https://rdap.org/domain/acme.${tld}`, json(404, {})]]);
      assert.equal(r.status, STATUS.AVAILABLE);
      assert.equal(r.via, 'rdap.org');
    });
  }

  test('rdap.org answering "no RDAP service" is not mistaken for an unregistered domain', async () => {
    const noService = json(404, { errorCode: 404, title: 'No RDAP service is available for this resource' });
    const r = await check('ai', 'acme', [
      ['https://rdap.org/', noService],
      ['https://dns.google/resolve?name=acme.ai', json(200, { Status: 0, Answer: [{ data: 'ns1.example.' }] })],
    ]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.via, 'Google DNS');
  });

  test('.io skips rdap.org, which has no .io service', async () => {
    const r = await check('io', 'acme', [['https://dns.google/resolve?name=acme.io', json(200, { Status: 3 })]]);
    assert.equal(r.status, STATUS.LIKELY);
    assert.ok(!r.calls.some(({ url }) => url.startsWith('https://rdap.org/')));
  });

  for (const tld of ['co', 'so']) {
    test(`.${tld} has no public registry lookup, so only DNS is asked`, async () => {
      const r = await check(tld, 'acme', [[`https://dns.google/resolve?name=acme.${tld}`, json(200, { Status: 3 })]]);
      assert.equal(r.status, STATUS.LIKELY);
      assert.match(r.note, new RegExp(`\\.${tld} has no public registry lookup`));
      assert.deepEqual(r.calls.map(({ url }) => url), [`https://dns.google/resolve?name=acme.${tld}&type=NS`]);
    });
  }
});

describe('GitHub', () => {
  test('404 means available', async () => {
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(404, { message: 'Not Found' })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('an organization means taken, with avatar', async () => {
    const body = { login: 'acme', type: 'Organization', name: 'Acme Inc', avatar_url: 'https://avatars.githubusercontent.com/u/1' };
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Organization: Acme Inc');
    assert.equal(r.avatar, body.avatar_url);
  });

  test('rate limiting is reported as unknown', async () => {
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(403, { message: 'API rate limit exceeded' })]]);
    assert.equal(r.status, STATUS.UNKNOWN);
    assert.match(r.note, /limit/i);
  });
});

describe('X', () => {
  test('oEmbed 200 means taken', async () => {
    const r = await check('x', 'jack', [['https://publish.x.com/oembed?url=https://x.com/jack', json(200, { url: 'https://x.com/jack' })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /@jack/);
  });

  test('oEmbed 404 means available', async () => {
    const r = await check('x', 'acme', [['https://publish.x.com/oembed', html(404)]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('oEmbed 404 is overruled when FxTwitter knows the account (e.g. protected)', async () => {
    const r = await check('x', 'acme', [
      ['https://publish.x.com/oembed', html(404)],
      ['https://api.fxtwitter.com/acme', json(200, { code: 200, user: { screen_name: 'acme', name: 'Acme Corp' } })],
    ]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Account: Acme Corp');
  });

  test('falls back to FxTwitter, which reports suspended accounts', async () => {
    const r = await check('x', 'acme', [
      ['https://api.fxtwitter.com/acme', json(404, { code: 404, message: 'User is suspended', reason: 'suspended' })],
    ]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /suspended/);
  });

  test('is unknown when both sources fail', async () => {
    const r = await check('x', 'acme', [['https://publish.x.com/oembed', html(503)]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('YouTube', () => {
  test('unavatar 404 means available', async () => {
    const r = await check('youtube', 'acme', [['https://unavatar.io/youtube/acme', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('unavatar 200 means taken, with avatar', async () => {
    const r = await check('youtube', 'acme', [['https://unavatar.io/youtube/acme', json(200, { url: 'https://yt3.ggpht.com/a' })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, 'https://yt3.ggpht.com/a');
  });

  test('falls back to Jina Reader when unavatar is rate limited', async () => {
    const routes = (data) => [
      ['https://unavatar.io/', json(429, {})],
      ['https://r.jina.ai/https://www.youtube.com/@acme', jina(data)],
    ];
    const missing = await check('youtube', 'acme', routes({ title: '404 Not Found', httpStatus: 404 }));
    assert.equal(missing.status, STATUS.AVAILABLE);
    const found = await check('youtube', 'acme', routes({ title: 'Acme', warning: 'Target URL returned error 401: Unauthorized' }));
    assert.equal(found.status, STATUS.TAKEN);
    const consent = await check('youtube', 'acme', routes({ title: 'Before you continue to YouTube' }));
    assert.equal(consent.status, STATUS.UNKNOWN);
  });
});

describe('TikTok', () => {
  test('oEmbed 200 means taken', async () => {
    const body = { author_name: 'Acme', author_url: 'https://www.tiktok.com/@acme' };
    const r = await check('tiktok', 'acme', [['https://www.tiktok.com/oembed?url=https://www.tiktok.com/@acme', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
  });

  test('a blocked oEmbed falls back to Jina Reader', async () => {
    const page = (title) => [['https://r.jina.ai/https://www.tiktok.com/@acme', jina({ title })]];
    const missing = await check('tiktok', 'acme', page('Couldn’t find this account. Visit TikTok to discover more.'));
    assert.equal(missing.status, STATUS.AVAILABLE);
    const found = await check('tiktok', 'acme', page('Acme Corp (@acme) | TikTok'));
    assert.equal(found.status, STATUS.TAKEN);
    assert.equal(found.note, 'Account: Acme Corp');
  });

  test('is likely available when only the unknown profile fails while TikTok itself answers', async () => {
    const r = await check('tiktok', 'acme', [
      ['https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok', json(200, { author_url: 'https://www.tiktok.com/@tiktok' })],
    ]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('is unknown when TikTok is unreachable', async () => {
    assert.equal((await check('tiktok', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('Threads and Instagram', () => {
  const threadsPage = (data) => [['https://r.jina.ai/https://www.threads.com/@acme', jina(data)]];

  test('a Threads profile marks both Threads and Instagram as taken', async () => {
    const routes = threadsPage({ title: 'Acme (@acme) • Threads, Say more', finalUrl: 'https://www.threads.com/@acme' });
    const out = await checkAll('acme', { fetch: mockFetch(routes), platforms: PLATFORMS.filter((p) => ['instagram', 'threads'].includes(p.id)) });
    assert.equal(out.threads.status, STATUS.TAKEN);
    assert.equal(out.instagram.status, STATUS.TAKEN);
  });

  test('a login redirect leaves both to be checked manually', async () => {
    const routes = threadsPage({ title: 'Threads • Log in', finalUrl: 'https://www.threads.com/login/?next=%2F%40acme' });
    const out = await checkAll('acme', { fetch: mockFetch(routes), platforms: PLATFORMS.filter((p) => ['instagram', 'threads'].includes(p.id)) });
    assert.equal(out.threads.status, STATUS.MANUAL);
    assert.match(out.threads.note, /No public Threads profile/);
    assert.equal(out.instagram.status, STATUS.MANUAL);
  });

  test('Instagram on its own (or retried) looks Threads up itself', async () => {
    const taken = await check('instagram', 'acme', threadsPage({ title: 'Acme (@acme) • Threads, Say more' }));
    assert.equal(taken.status, STATUS.TAKEN);
    assert.equal(taken.calls.length, 1);
    const unknown = await check('instagram', 'acme', []);
    assert.equal(unknown.status, STATUS.MANUAL);
  });

  test('Instagram reuses the Threads lookup when both are checked together', async () => {
    const fetch = mockFetch(threadsPage({ title: 'Acme (@acme) • Threads, Say more' }));
    await checkAll('acme', { fetch, platforms: PLATFORMS.filter((p) => ['instagram', 'threads'].includes(p.id)) });
    assert.equal(fetch.calls.length, 1);
  });
});

describe('Facebook', () => {
  const graph = 'https://graph.facebook.com/acmerocket/picture';

  test('a public Page means taken', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(200, { data: { url: 'https://scontent.xx.fbcdn.net/a.jpg', is_silhouette: false } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, 'https://scontent.xx.fbcdn.net/a.jpg');
  });

  test('a silhouette picture is not shown', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(200, { data: { url: 'https://x/a.jpg', is_silhouette: true } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, undefined);
  });

  test('error 100 means likely available', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(400, { error: { code: 100, message: 'does not exist' } })]]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('other errors are unknown', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(400, { error: { code: 4, message: 'rate limit' } })]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('LinkedIn', () => {
  const page = (data) => ['https://r.jina.ai/https://www.linkedin.com/company/acme', jina(data)];

  test('a 404 page means available', async () => {
    const r = await check('linkedin', 'acme', [page({ title: 'LinkedIn', warning: 'Target URL returned error 404: Not Found' })]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('a company title means taken', async () => {
    const r = await check('linkedin', 'acme', [page({ title: 'Acme Inc | LinkedIn', httpStatus: 200 })]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Company: Acme Inc');
  });

  test('login walls fall back to Microlink', async () => {
    const r = await check('linkedin', 'acme', [
      page({ title: 'LinkedIn Login, Sign in | LinkedIn', httpStatus: 200 }),
      ['https://api.microlink.io/', json(200, { status: 'success', statusCode: 404, data: { title: 'LinkedIn' } })],
    ]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'Microlink');
  });

  test('is unknown when nothing answers', async () => {
    assert.equal((await check('linkedin', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('Bluesky', () => {
  const api = 'https://public.api.bsky.app/xrpc/';
  const profile = `${api}app.bsky.actor.getProfile?actor=acme.bsky.social`;
  const resolve = `${api}com.atproto.identity.resolveHandle?handle=acme.bsky.social`;
  const notFound = json(400, { error: 'InvalidRequest', message: 'Profile not found' });

  test('a profile means taken, with avatar', async () => {
    const body = { did: 'did:plc:abc', handle: 'acme.bsky.social', displayName: 'Acme', avatar: 'https://cdn.bsky.app/a.jpg' };
    const r = await check('bluesky', 'acme', [[profile, json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Account: Acme');
    assert.equal(r.avatar, body.avatar);
  });

  test('a handle that does not resolve means available', async () => {
    const r = await check('bluesky', 'acme', [[profile, notFound], [resolve, json(400, { error: 'InvalidRequest', message: 'Unable to resolve handle' })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('a resolving handle without a profile (e.g. deactivated) is taken', async () => {
    const r = await check('bluesky', 'acme', [[profile, notFound], [resolve, json(200, { did: 'did:plc:abc' })]]);
    assert.equal(r.status, STATUS.TAKEN);
  });

  test('is unknown when the API is unreachable', async () => {
    assert.equal((await check('bluesky', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('Reddit', () => {
  const available = 'https://www.reddit.com/api/username_available.json?user=acme';
  const about = 'https://www.reddit.com/user/acme/about.json';

  test('username_available answers directly', async () => {
    assert.equal((await check('reddit', 'acme', [[available, json(200, true)]])).status, STATUS.AVAILABLE);
    assert.equal((await check('reddit', 'acme', [[available, json(200, false)]])).status, STATUS.TAKEN);
  });

  test('falls back to the public profile', async () => {
    const taken = await check('reddit', 'acme', [[about, json(200, { kind: 't2', data: { name: 'Acme' } })]]);
    assert.equal(taken.status, STATUS.TAKEN);
    assert.equal(taken.note, 'User u/Acme');
    const missing = await check('reddit', 'acme', [[about, json(404, { message: 'Not Found', error: 404 })]]);
    assert.equal(missing.status, STATUS.LIKELY);
  });

  test('a blocked network leaves it to be checked manually', async () => {
    assert.equal((await check('reddit', 'acme', [])).status, STATUS.MANUAL);
  });
});

describe('Pinterest', () => {
  const pins = 'https://widgets.pinterest.com/v3/pidgets/users/acme/pins/';

  test('a profile means taken, with avatar', async () => {
    const body = { status: 'success', data: { user: { full_name: 'Acme', image_small_url: 'https://i.pinimg.com/a.jpg' }, pins: [] } };
    const r = await check('pinterest', 'acme', [[pins, json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Profile: Acme');
    assert.equal(r.avatar, 'https://i.pinimg.com/a.jpg');
  });

  test('"User not found" means available', async () => {
    const r = await check('pinterest', 'acme', [[pins, json(404, { status: 'failure', code: 30, message: 'User not found.' })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('falls back to api.pinterest.com when the widget host is rate limited', async () => {
    const api = 'https://api.pinterest.com/v3/pidgets/users/acme/pins/';
    const r = await check('pinterest', 'acme', [[pins, blocked()], [api, json(404, { status: 'failure', code: 30 })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.deepEqual(r.calls.map((c) => c.url), [pins, api]);
  });

  test('other errors are unknown', async () => {
    const api = 'https://api.pinterest.com/v3/pidgets/users/acme/pins/';
    const r = await check('pinterest', 'acme', [[pins, json(429, { status: 'failure' })], [api, json(500, {})]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('Twitch', () => {
  const ivr = 'https://api.ivr.fi/v2/twitch/user?login=acme';

  test('an empty list means available', async () => {
    assert.equal((await check('twitch', 'acme', [[ivr, json(200, [])]])).status, STATUS.AVAILABLE);
  });

  test('a channel means taken, banned or not', async () => {
    const r = await check('twitch', 'acme', [[ivr, json(200, [{ login: 'acme', displayName: 'Acme', banned: true, logo: 'https://static-cdn.jtvnw.net/a.png' }])]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Channel: Acme (banned)');
    assert.equal(r.avatar, 'https://static-cdn.jtvnw.net/a.png');
  });
});

describe('Discord', () => {
  const invite = 'https://discord.com/api/v10/invites/acme';

  test('an invite means taken, with the server icon', async () => {
    const r = await check('discord', 'acme', [[invite, json(200, { code: 'acme', guild: { id: '1', name: 'Acme', icon: 'abc' } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /Acme/);
    assert.equal(r.avatar, 'https://cdn.discordapp.com/icons/1/abc.png?size=64');
  });

  test('"Unknown Invite" means available', async () => {
    const r = await check('discord', 'acme', [[invite, json(404, { message: 'Unknown Invite', code: 10006 })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('rate limits are unknown', async () => {
    assert.equal((await check('discord', 'acme', [[invite, json(429, { message: 'You are being rate limited.' })]])).status, STATUS.UNKNOWN);
  });
});

describe('Telegram', () => {
  const page = (data) => [['https://r.jina.ai/https://t.me/acmerocket', jina(data)]];

  test('the generic contact page means likely available', async () => {
    const r = await check('telegram', 'acmerocket', page({ title: 'Telegram: Contact @acmerocket', httpStatus: 200 }));
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('a named page means taken, even when the name starts with "Telegram"', async () => {
    const r = await check('telegram', 'acmerocket', page({ title: 'Telegram News', httpStatus: 200 }));
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'In use by “Telegram News”');
  });

  test('a rate limit is unknown', async () => {
    const r = await check('telegram', 'acmerocket', [['https://r.jina.ai/', json(429, {})]]);
    assert.equal(r.status, STATUS.UNKNOWN);
    assert.match(r.note, /rate limit/);
  });
});

describe('Mastodon', () => {
  const lookup = 'https://mastodon.social/api/v1/accounts/lookup?acct=acme';

  test('an account means taken, with avatar', async () => {
    const r = await check('mastodon', 'acme', [[lookup, json(200, { id: '1', acct: 'acme', display_name: 'Acme', avatar: 'https://files.mastodon.social/a.png' })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Account: Acme');
  });

  test('404 means available', async () => {
    assert.equal((await check('mastodon', 'acme', [[lookup, json(404, { error: 'Record not found' })]])).status, STATUS.AVAILABLE);
  });
});

describe('Tumblr', () => {
  const avatar = 'https://api.tumblr.com/v2/blog/acme/avatar/64';

  test('a redirect to the avatar means taken, without following it', async () => {
    const r = await check('tumblr', 'acme', [[avatar, new Response(null, { status: 302, headers: { location: 'https://64.media.tumblr.com/a.png' } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, avatar);
    assert.equal(r.calls[0].init.redirect, 'manual');
  });

  test('404 means available', async () => {
    const r = await check('tumblr', 'acme', [[avatar, json(404, { meta: { status: 404, msg: 'Not Found' } })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('looks up a unique URL, because the CDN caches the CORS header of the first caller', async () => {
    const routes = [[avatar, json(404, { meta: { status: 404, msg: 'Not Found' } })]];
    const first = await check('tumblr', 'acme', routes);
    const second = await check('tumblr', 'acme', routes);
    assert.match(first.calls[0].url, /^https:\/\/api\.tumblr\.com\/v2\/blog\/acme\/avatar\/64\?_=[a-z0-9]+$/);
    assert.notEqual(first.calls[0].url, second.calls[0].url);
  });
});

describe('Substack', () => {
  const page = (data) => [['https://r.jina.ai/https://acme.substack.com/', jina(data)]];

  test('a 404 means available', async () => {
    const r = await check('substack', 'acme', page({ title: '', warning: 'Target URL returned error 404: Not Found' }));
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('a publication means taken', async () => {
    const r = await check('substack', 'acme', page({ title: 'Acme Weekly | Substack', httpStatus: 200 }));
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Publication: Acme Weekly');
  });
});

describe('Hacker News', () => {
  const user = 'https://hacker-news.firebaseio.com/v0/user/acme.json';

  test('a user means taken', async () => {
    const r = await check('hackernews', 'acme', [[user, json(200, { id: 'acme', karma: 42 })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'User acme (42 karma)');
  });

  test('null means likely available (usernames are case-sensitive)', async () => {
    assert.equal((await check('hackernews', 'acme', [[user, json(200, null)]])).status, STATUS.LIKELY);
  });

  test('is unknown when the API is unreachable', async () => {
    assert.equal((await check('hackernews', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('checkAll', () => {
  test('reports every platform once and only sends CORS-safe requests', async () => {
    const fetch = mockFetch([]);
    const seen = [];
    const out = await checkAll('acmerocket', { fetch, onResult: (id, r) => seen.push([id, r.status]) });
    assert.deepEqual(seen.map(([id]) => id).sort(), PLATFORMS.map((p) => p.id).sort());
    assert.deepEqual(Object.keys(out).sort(), PLATFORMS.map((p) => p.id).sort());
    for (const { url, init } of fetch.calls) {
      assert.match(url, /^https:\/\//);
      assert.equal(init.credentials, 'omit');
      assert.deepEqual(Object.keys(init.headers || {}).filter((h) => h.toLowerCase() !== 'accept'), [], url);
    }
  });

  test('every request goes to a host allowed by the page CSP', async () => {
    const { readFile } = await import('node:fs/promises');
    const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
    const allowed = /connect-src ([^;]+);/.exec(page)[1].trim().split(/\s+/);
    const fetch = mockFetch([]);
    await checkAll('acmerocket', { fetch });
    for (const { url } of fetch.calls) {
      assert.ok(allowed.includes(new URL(url).origin), `${new URL(url).origin} is missing from connect-src`);
    }
  });

  test('a crashing check is reported as unknown', async () => {
    const boom = { id: 'boom', group: 'social', label: 'Boom', url: () => '', check: () => { throw new Error('boom'); } };
    const out = await checkAll('acme', { fetch: mockFetch([]), platforms: [boom] });
    assert.equal(out.boom.status, STATUS.UNKNOWN);
  });

  test('timeouts are handled like failures', async () => {
    const timeout = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const r = await check('github', 'acme', [['https://api.github.com/', timeout]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});
