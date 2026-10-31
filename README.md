# Startup Name Checker

Check if a startup name is free as a **.com, .net, .app, .io, .co, .ai or .pro** domain and on **18 social platforms**, all at once: Instagram, X, GitHub, YouTube, TikTok, Threads, Facebook, LinkedIn, Bluesky, Reddit, Pinterest, Twitch, Discord, Telegram, Mastodon, Tumblr, Substack and Hacker News.

**▶ Try it: <https://dariusz.porowski.dev/startup-name-checker/>**

It's one static page with no backend, no build step, no cookies and no tracking. Your browser does every lookup itself, against public endpoints that allow cross-origin requests.

- **Pick what to check** with the checkboxes under the search box. By default it checks **.com** and the eight platforms from Instagram to LinkedIn.
- **Retry one result** with its ↻ button. Only that lookup runs again, so the other results stay as they are.
- **Share a result** with the page address. `name` is the name; `domains` and `social` list what to check, separated by commas. For example, <https://dariusz.porowski.dev/startup-name-checker/?name=acmerocket&domains=com,io,ai&social=x,github,bluesky>. Leave out `domains` or `social` to use the defaults, or leave one empty (`domains=`) to check none.
- Every link to another site opens in a new tab.

![Screenshot of the results for "acmerocket"](docs/screenshot.png)

## What it checks

| Place | Link | How it's checked |
| --- | --- | --- |
| `.com`, `.net` | `https://NAME.com` | [Verisign RDAP](https://rdap.verisign.com/), then [rdap.org](https://rdap.org/), then [Google Public DNS](https://developers.google.com/speed/public-dns/docs/doh/json) |
| `.app` | `https://NAME.app` | [Google Registry RDAP](https://pubapi.registry.google/), then rdap.org, then Google Public DNS |
| `.io`, `.ai`, `.pro` | `https://NAME.io` | [Identity Digital RDAP](https://www.identity.digital/), then rdap.org (except `.io`), then Google Public DNS |
| `.co` | `https://NAME.co` | Google Public DNS only, because `.co` has no public registry lookup |
| Instagram | `https://www.instagram.com/NAME` | Instagram blocks lookups from browsers, so open the link to check. Marked **taken** if the handle has a Threads profile. |
| X | `https://x.com/NAME` | X oEmbed, then [FxTwitter](https://github.com/FxEmbed/FxEmbed) |
| GitHub | `https://github.com/NAME` | [GitHub REST API](https://docs.github.com/rest/users/users#get-a-user) |
| YouTube | `https://www.youtube.com/@NAME` | [Unavatar](https://unavatar.io), then [Jina Reader](https://jina.ai/reader/) |
| TikTok | `https://www.tiktok.com/@NAME` | TikTok oEmbed, then Jina Reader |
| Threads | `https://www.threads.com/@NAME` | Jina Reader |
| Facebook | `https://www.facebook.com/NAME` | Facebook Graph API (public Pages only) |
| LinkedIn | `https://www.linkedin.com/company/NAME` | Jina Reader, then [Microlink](https://microlink.io) |
| Bluesky | `https://bsky.app/profile/NAME.bsky.social` | [Bluesky public API](https://docs.bsky.app/docs/advanced-guides/api-directory) |
| Reddit | `https://www.reddit.com/user/NAME` | Reddit's username check and profile API |
| Pinterest | `https://www.pinterest.com/NAME/` | Pinterest widget API |
| Twitch | `https://www.twitch.tv/NAME` | [ivr.fi](https://api.ivr.fi/v2/docs), a public Twitch lookup API |
| Discord | `https://discord.gg/NAME` | Discord invite API |
| Telegram | `https://t.me/NAME` | Jina Reader |
| Mastodon | `https://mastodon.social/@NAME` | [mastodon.social API](https://docs.joinmastodon.org/methods/accounts/#lookup) |
| Tumblr | `https://www.tumblr.com/NAME` | Tumblr API |
| Substack | `https://NAME.substack.com` | Jina Reader |
| Hacker News | `https://news.ycombinator.com/user?id=NAME` | [Hacker News API](https://github.com/HackerNews/API) |

Each result has one of these statuses:

- **Available**: the service confirmed nobody uses the name.
- **Likely available**: no trace found, but the service can't fully confirm it.
- **Taken**: the name is in use.
- **Check manually**: the service blocks automated lookups, so open the link.
- **Unknown**: the lookup failed or hit a rate limit. Try again later.
- **Not allowed**: the name breaks the platform's username rules, for example X handles of more than 15 characters.

## Good to know

- YouTube and TikTok profiles live at `/@NAME`. Without the `@`, those URLs don't point to a profile. `threads.net` now redirects to `threads.com`.
- Threads uses Instagram usernames, so a Threads profile means the Instagram handle is taken. If there's no Threads profile, Instagram still needs a manual check.
- Facebook only exposes public **Pages**. Personal profiles are private, so "no Page found" is shown as **Likely available**.
- `.co` is checked through DNS only, so a domain without DNS records shows as **Likely available**. A registered domain can still have no records.
- Bluesky is checked for the default `NAME.bsky.social` handle, and Mastodon only on the mastodon.social server. Discord is checked for a custom invite link (`discord.gg/NAME`), which only boosted servers can set; Discord usernames can't be looked up.
- Reddit blocks lookups from some networks, such as VPNs and cloud providers. The row then says **Check manually**. Names of deleted Reddit accounts can't be registered again.
- Telegram shows the same page for free, reserved and auctioned usernames, so a name nobody uses is **Likely available**. The Hacker News API is case-sensitive, so "no user" is **Likely available** too.
- The free services limit how often each IP can use them: GitHub API 60 lookups/hour, Unavatar 25/day, Jina Reader 20/minute, Microlink 5/day. Pinterest limits lookups too. When a limit is hit, that row shows **Unknown**; use its ↻ button to try again later.
- Platforms change their pages without notice, so results are best effort. Confirm before you buy a domain or print business cards.

## Privacy

The name you type is sent directly from your browser to the services above, and nowhere else. Only the services you select are asked. The page sets a strict Content Security Policy that only allows connections to those hosts. It doesn't send cookies or a referrer, and it doesn't store anything; your selection lives only in the page address.

## Development

Requires Node.js 20 or later. The app lives in [`site/`](site) and runs without a build step.

```sh
npm install
npm start                         # serves site/ at http://127.0.0.1:4173/
npm run test:unit                 # lookup logic with a mocked network (node:test)
npx playwright install chromium
npm run test:e2e                  # UI tests in Chromium with a mocked network
LIVE_URL=https://dariusz.porowski.dev/startup-name-checker/ npm run test:live   # real services
```

| File | Purpose |
| --- | --- |
| [`site/index.html`](site/index.html) | Page markup and Content Security Policy |
| [`site/checker.js`](site/checker.js) | Name rules and per-platform lookups (no DOM, testable in Node) |
| [`site/app.js`](site/app.js) | UI: checkboxes, result rows, retries and the page address |
| [`site/icons.js`](site/icons.js), [`site/style.css`](site/style.css) | Icons and styles |
| [`tests/`](tests) | Unit tests, mocked UI tests and live smoke tests |

To add or change a platform, edit the `PLATFORMS` list in `site/checker.js` and add its icon to `site/icons.js`. The checkbox appears automatically; `defaultChecked` decides whether it's selected by default. If the lookup uses a new host, add that host to `connect-src` in `site/index.html`; a unit test fails when one is missing.

## Deployment

Every push to `main` runs the [CI workflow](.github/workflows/ci.yml). It runs the tests, then uploads `site/` as an artifact and deploys it with GitHub's official Pages actions ([`configure-pages`](https://github.com/actions/configure-pages), [`upload-pages-artifact`](https://github.com/actions/upload-pages-artifact) and [`deploy-pages`](https://github.com/actions/deploy-pages)). There's no publishing branch. Then it runs the [Live check workflow](.github/workflows/live-check.yml), which tests the deployed page against the real services. You can also run the live check manually from the Actions tab.

Every action is pinned to a full commit SHA, with its version in a comment.

To set this up, for example in a fork:

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Environments → github-pages**, make sure **Deployment branches and tags** allows `main`.
3. Push to `main`, or run the CI workflow from the Actions tab.

## Credits

- Brand icons from [Simple Icons](https://simpleicons.org) (CC0). Brand names and logos belong to their owners. This project isn't affiliated with any of them.
- [Avatars provided by Unavatar](https://unavatar.io).

## License

[MIT](LICENSE)
