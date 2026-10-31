// Availability checks for a startup name. Pure logic (no DOM): runs in browsers and Node 18+.
// Every lookup goes straight from the browser to a public, CORS-enabled endpoint — no backend.

export const STATUS = Object.freeze({
  CHECKING: 'checking',
  AVAILABLE: 'available',
  LIKELY: 'likely',
  TAKEN: 'taken',
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
  INVALID: 'invalid',
});

export const STATUS_LABEL = Object.freeze({
  checking: 'Checking…',
  available: 'Available',
  likely: 'Likely available',
  taken: 'Taken',
  manual: 'Check manually',
  unknown: 'Unknown',
  invalid: 'Not allowed',
});

/** Turns user input like " @My Startup ", "https://www.mystartup.com/" into "mystartup". */
export function normalizeName(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/\.(com|app)$/, '');
}

/** Returns an error message for unusable input, or null when the name can be checked. */
export function validateInput(name) {
  if (!name) return 'Enter a name to check.';
  if (name.length > 63) return 'Keep the name to 63 characters or fewer.';
  if (!/^[a-z0-9._-]+$/.test(name)) return 'Use only letters, numbers, dots, hyphens and underscores.';
  return null;
}

const noEdgeDots = (n) => !n.startsWith('.') && !n.endsWith('.') && !n.includes('..');

const RULES = {
  domain: {
    test: (n) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(n) && n.slice(2, 4) !== '--',
    hint: 'Domains allow letters, numbers and hyphens (not at the start or end).',
  },
  instagram: {
    test: (n) => /^[a-z0-9._]{1,30}$/.test(n) && noEdgeDots(n),
    hint: 'Instagram allows up to 30 letters, numbers, periods and underscores (no leading, trailing or double periods).',
  },
  x: {
    test: (n) => /^[a-z0-9_]{1,15}$/.test(n) && !/twitter|admin/.test(n),
    hint: 'X allows up to 15 letters, numbers and underscores, without “twitter” or “admin”.',
  },
  github: {
    test: (n) => /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(n),
    hint: 'GitHub allows up to 39 letters, numbers and single hyphens (not at the start or end).',
  },
  youtube: {
    test: (n) => /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(n),
    hint: 'YouTube handles are 3–30 letters, numbers, periods, hyphens or underscores, starting and ending with a letter or number.',
  },
  tiktok: {
    test: (n) => /^[a-z0-9._]{2,24}$/.test(n) && !n.endsWith('.'),
    hint: 'TikTok allows 2–24 letters, numbers, periods and underscores (not ending with a period).',
  },
  facebook: {
    test: (n) => /^[a-z0-9.]{5,50}$/.test(n) && noEdgeDots(n) && !/^\d+$/.test(n),
    hint: 'Facebook usernames are 5–50 letters, numbers or periods (not only numbers).',
  },
  linkedin: {
    test: (n) => /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(n) && n.length >= 2 && !n.includes('linkedin'),
    hint: 'LinkedIn company URLs allow 2–100 letters, numbers and hyphens (not at the start or end).',
  },
};

const result = (status, note, extra = {}) => ({ status, note, ...extra });

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * GET that never throws. Cross-origin responses without CORS headers surface as
 * `{ status: 0, error: 'network' }` because browsers hide them from scripts.
 */
async function get(ctx, url, { timeout = 15000, headers } = {}) {
  try {
    const res = await ctx.fetch(url, {
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: timeoutSignal(timeout),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, status: 0, body: null, error: timedOut ? 'timeout' : 'network' };
  }
}

/** Fetches a page through Jina Reader (r.jina.ai), which reports the target's HTTP status and title. */
async function readPage(ctx, url) {
  const r = await get(ctx, `https://r.jina.ai/${url}`, { timeout: 30000, headers: { Accept: 'application/json' } });
  const data = r.body && r.body.data;
  if (!r.ok || !data) return { ok: false, rateLimited: r.status === 429, title: '', finalUrl: '', httpStatus: 0 };
  let httpStatus = Number(data.httpStatus) || 0;
  const warned = /returned error (\d{3})/.exec(String(data.warning || ''));
  if (!httpStatus && warned) httpStatus = Number(warned[1]);
  return { ok: true, title: String(data.title || '').trim(), finalUrl: String(data.finalUrl || data.url || ''), httpStatus };
}

const failed = (what = 'The lookup failed') => result(STATUS.UNKNOWN, `${what} — try again in a minute or open the link.`);

// ---------------------------------------------------------------- domains

const RDAP = {
  com: { base: 'https://rdap.verisign.com/com/v1/', via: 'Verisign RDAP' },
  app: { base: 'https://pubapi.registry.google/rdap/', via: 'Google Registry RDAP' },
};

async function checkDomain(name, tld, ctx) {
  const domain = `${name}.${tld}`;
  const sources = [RDAP[tld], { base: 'https://rdap.org/', via: 'rdap.org' }];
  for (const { base, via } of sources) {
    const r = await get(ctx, `${base}domain/${domain}`);
    if (r.status === 404) return result(STATUS.AVAILABLE, 'Not registered', { via });
    if (r.ok && r.body && r.body.objectClassName === 'domain') {
      const reg = (r.body.events || []).find((e) => e.eventAction === 'registration');
      const since = reg && reg.eventDate ? ` since ${String(reg.eventDate).slice(0, 10)}` : '';
      return result(STATUS.TAKEN, `Registered${since}`, { via });
    }
  }
  const dns = await get(ctx, `https://dns.google/resolve?name=${domain}&type=NS`);
  if (dns.ok && dns.body) {
    if (dns.body.Status === 3) return result(STATUS.LIKELY, 'No DNS records (registry lookup unavailable)', { via: 'Google DNS' });
    if (dns.body.Status === 0) return result(STATUS.TAKEN, 'Domain exists in DNS', { via: 'Google DNS' });
  }
  return failed('Registry lookup failed');
}

// ---------------------------------------------------------------- social

async function checkGitHub(name, ctx) {
  const via = 'GitHub API';
  const r = await get(ctx, `https://api.github.com/users/${name}`);
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No user or organization with this name', { via });
  if (r.ok && r.body && r.body.login) {
    const kind = r.body.type === 'Organization' ? 'Organization' : 'User';
    return result(STATUS.TAKEN, `${kind}: ${r.body.name || r.body.login}`, { via, avatar: r.body.avatar_url });
  }
  if (r.status === 403 || r.status === 429) {
    return result(STATUS.UNKNOWN, 'GitHub API limit reached (60 lookups/hour) — try later or open the link.', { via });
  }
  return failed();
}

async function checkX(name, ctx) {
  const r = await get(ctx, `https://publish.x.com/oembed?url=https://x.com/${name}`);
  if (r.ok && r.body) {
    const handle = String(r.body.url || '').split('/').pop() || name;
    return result(STATUS.TAKEN, `Account @${handle} exists`, { via: 'X oEmbed' });
  }
  // oEmbed can't embed protected accounts either, so a 404 is confirmed with FxTwitter first.
  const f = await get(ctx, `https://api.fxtwitter.com/${name}`);
  if (f.ok && f.body && f.body.user) {
    return result(STATUS.TAKEN, `Account: ${f.body.user.name || f.body.user.screen_name}`, { via: 'FxTwitter' });
  }
  if (f.body && f.body.reason === 'suspended') return result(STATUS.TAKEN, 'Account exists (suspended)', { via: 'FxTwitter' });
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No account with this handle', { via: 'X oEmbed' });
  return failed();
}

const isErrorTitle = (title) => !title || /^(404|error)|not found|before you continue|captcha|sign in|log in/i.test(title);

async function checkYouTube(name, ctx) {
  const u = await get(ctx, `https://unavatar.io/youtube/${name}?fallback=false&json`);
  if (u.status === 404) return result(STATUS.AVAILABLE, 'No channel with this handle', { via: 'unavatar.io' });
  if (u.ok && u.body && u.body.url) return result(STATUS.TAKEN, 'Channel exists', { via: 'unavatar.io', avatar: u.body.url });

  const page = await readPage(ctx, `https://www.youtube.com/@${name}`);
  if (page.ok && page.httpStatus === 404) return result(STATUS.AVAILABLE, 'No channel with this handle', { via: 'Jina Reader' });
  if (page.ok && !isErrorTitle(page.title)) return result(STATUS.TAKEN, `Channel: ${page.title}`, { via: 'Jina Reader' });
  return failed(page.rateLimited ? 'Lookup rate limit reached' : undefined);
}

async function checkTikTok(name, ctx) {
  const oembed = (handle) => get(ctx, `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${handle}`);
  const r = await oembed(name);
  if (r.ok && r.body && r.body.author_url) {
    return result(STATUS.TAKEN, `Account: ${r.body.author_name || name}`, { via: 'TikTok oEmbed' });
  }
  // TikTok answers unknown users with a 400 that lacks CORS headers, so the browser only sees a failure.
  const page = await readPage(ctx, `https://www.tiktok.com/@${name}`);
  if (page.ok && /couldn.t find this account/i.test(page.title)) {
    return result(STATUS.AVAILABLE, 'No account with this username', { via: 'Jina Reader' });
  }
  if (page.ok && page.title.toLowerCase().includes(`(@${name})`)) {
    return result(STATUS.TAKEN, `Account: ${page.title.split(' (@')[0]}`, { via: 'Jina Reader' });
  }
  const canary = await oembed('tiktok');
  if (canary.ok) return result(STATUS.LIKELY, 'TikTok returned no profile for this username', { via: 'TikTok oEmbed' });
  return failed();
}

async function checkThreads(name, ctx) {
  const page = await readPage(ctx, `https://www.threads.com/@${name}`);
  if (page.ok && page.title.toLowerCase().includes(`(@${name})`)) {
    return result(STATUS.TAKEN, `Profile: ${page.title.split(' (@')[0]}`, { via: 'Jina Reader' });
  }
  if (page.ok && /\/login/.test(page.finalUrl)) {
    return result(STATUS.MANUAL, 'No public Threads profile found. Threads uses Instagram usernames, so it depends on Instagram.', {
      via: 'Jina Reader',
    });
  }
  return result(STATUS.MANUAL, 'Threads could not be checked automatically — open the link to check.');
}

async function checkInstagram(name, ctx, dependsOn) {
  const threads = await dependsOn('threads');
  if (threads && threads.status === STATUS.TAKEN) {
    return result(STATUS.TAKEN, 'In use — this handle has a Threads profile, and Threads shares Instagram usernames.', {
      via: 'Threads',
    });
  }
  return result(STATUS.MANUAL, 'Instagram blocks automated lookups from browsers — open the link to check.');
}

async function checkFacebook(name, ctx) {
  const via = 'Facebook Graph API';
  const r = await get(ctx, `https://graph.facebook.com/${name}/picture?redirect=false&type=small`);
  if (r.ok && r.body && r.body.data) {
    const avatar = r.body.data.is_silhouette ? undefined : r.body.data.url;
    return result(STATUS.TAKEN, 'A public Page uses this username', { via, avatar });
  }
  if (r.body && r.body.error && r.body.error.code === 100) {
    return result(STATUS.LIKELY, 'No public Page found (personal profiles can’t be checked)', { via });
  }
  return failed();
}

async function checkLinkedIn(name, ctx) {
  const url = `https://www.linkedin.com/company/${name}`;
  // Login walls and sign-up pages are titled "… | LinkedIn" too, so ignore those.
  const isCompanyTitle = (t) => / \| LinkedIn$/.test(t) && !/^(linkedin|sign up|sign in|log in|join)\b/i.test(t);

  const page = await readPage(ctx, url);
  if (page.ok && page.httpStatus === 404) return result(STATUS.AVAILABLE, 'No company page at this URL', { via: 'Jina Reader' });
  if (page.ok && isCompanyTitle(page.title)) {
    return result(STATUS.TAKEN, `Company: ${page.title.replace(/ \| LinkedIn$/, '')}`, { via: 'Jina Reader' });
  }

  const m = await get(ctx, `https://api.microlink.io/?url=${encodeURIComponent(url)}`, { timeout: 30000 });
  const data = m.body || {};
  if (m.ok && data.statusCode === 404) return result(STATUS.AVAILABLE, 'No company page at this URL', { via: 'Microlink' });
  if (m.ok && data.statusCode === 200 && isCompanyTitle(String((data.data && data.data.title) || ''))) {
    return result(STATUS.TAKEN, `Company: ${data.data.title.replace(/ \| LinkedIn$/, '')}`, { via: 'Microlink' });
  }
  return failed('LinkedIn did not answer');
}

// ---------------------------------------------------------------- registry

export const PLATFORMS = [
  { id: 'com', group: 'domains', label: '.com', icon: 'domain', rule: RULES.domain, url: (n) => `https://${n}.com`, check: (n, ctx) => checkDomain(n, 'com', ctx) },
  { id: 'app', group: 'domains', label: '.app', icon: 'domain', rule: RULES.domain, url: (n) => `https://${n}.app`, check: (n, ctx) => checkDomain(n, 'app', ctx) },
  { id: 'instagram', group: 'social', label: 'Instagram', icon: 'instagram', rule: RULES.instagram, url: (n) => `https://www.instagram.com/${n}`, check: checkInstagram },
  { id: 'x', group: 'social', label: 'X', icon: 'x', rule: RULES.x, url: (n) => `https://x.com/${n}`, check: checkX },
  { id: 'github', group: 'social', label: 'GitHub', icon: 'github', rule: RULES.github, url: (n) => `https://github.com/${n}`, check: checkGitHub },
  { id: 'youtube', group: 'social', label: 'YouTube', icon: 'youtube', rule: RULES.youtube, url: (n) => `https://www.youtube.com/@${n}`, check: checkYouTube },
  { id: 'tiktok', group: 'social', label: 'TikTok', icon: 'tiktok', rule: RULES.tiktok, url: (n) => `https://www.tiktok.com/@${n}`, check: checkTikTok },
  { id: 'threads', group: 'social', label: 'Threads', icon: 'threads', rule: RULES.instagram, url: (n) => `https://www.threads.com/@${n}`, check: checkThreads },
  { id: 'facebook', group: 'social', label: 'Facebook', icon: 'facebook', rule: RULES.facebook, url: (n) => `https://www.facebook.com/${n}`, check: checkFacebook },
  { id: 'linkedin', group: 'social', label: 'LinkedIn', icon: 'linkedin', rule: RULES.linkedin, url: (n) => `https://www.linkedin.com/company/${n}`, check: checkLinkedIn },
];

/**
 * Runs every check in parallel. `onResult(id, result)` fires as each one settles.
 * Resolves to `{ [platformId]: result }`.
 */
export async function checkAll(name, { fetch: fetchImpl, onResult = () => {}, platforms = PLATFORMS } = {}) {
  const ctx = { fetch: fetchImpl || ((...args) => globalThis.fetch(...args)) };
  const settled = new Map();
  for (const p of platforms) {
    let resolve;
    settled.set(p.id, { promise: new Promise((r) => (resolve = r)), resolve });
  }
  const dependsOn = (id) => (settled.has(id) ? settled.get(id).promise : Promise.resolve(null));

  const run = async (p) => {
    if (p.rule && !p.rule.test(name)) return result(STATUS.INVALID, p.rule.hint);
    try {
      return await p.check(name, ctx, dependsOn);
    } catch {
      return failed();
    }
  };

  const entries = await Promise.all(
    platforms.map(async (p) => {
      const r = await run(p);
      settled.get(p.id).resolve(r);
      try {
        onResult(p.id, r);
      } catch (err) {
        console.error(err);
      }
      return [p.id, r];
    }),
  );
  return Object.fromEntries(entries);
}
