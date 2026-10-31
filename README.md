# Startup Name Checker

Check if a startup name is free as a **.com, .net, .org, .info, .app, .dev, .io, .co, .ai, .so, .pro, .cloud, .tech, .xyz, .design, .online, .shop or .store** domain and on **18 social platforms**, all at once: Instagram, X, GitHub, YouTube, TikTok, Threads, Facebook, LinkedIn, Bluesky, Reddit, Pinterest, Twitch, Discord, Telegram, Mastodon, Tumblr, Substack and Hacker News.

**▶ Try it: <https://dariusz.porowski.dev/startup-name-checker/>**

It's one static page with no backend, no cookies and no tracking. Your browser does every lookup itself, against public endpoints that allow cross-origin requests. The interface is built with [Primer Brand](https://github.com/primer/brand), GitHub's design system for its marketing sites.

- **Pick what to check** with the checkboxes under the search box. By default it checks **.com** and the eight platforms from Instagram to LinkedIn.
- **Include a domain ending** in the name, like `acme.design`, to check that exact domain. Its ending is ticked for you, and the other endings are checked as `acme-design.com`, `acme-design.io` and so on. On social platforms the dot stays wherever usernames allow it (Instagram, Threads, TikTok, YouTube and LinkedIn), and Bluesky, where handles are domain names, checks `acme.design` itself. Elsewhere the dot becomes the separator the platform uses: an underscore on X, Reddit, Pinterest, Twitch, Telegram, Mastodon and Hacker News (`acme_design`), and a hyphen on GitHub, Discord, Tumblr and Substack (`acme-design`). Facebook ignores periods in usernames, so there the dot is left out (`acmedesign`). Each result links to the exact address that was checked.
- **Retry one result** with its ↻ button. Only that lookup runs again, so the other results stay as they are.
- **Share a result** with the page address. `name` is the name; `domains` and `social` list what to check, separated by commas. For example, <https://dariusz.porowski.dev/startup-name-checker/?name=acmerocket&domains=com,io,ai&social=x,github,bluesky>. Leave out `domains` or `social` to use the defaults, or leave one empty (`domains=`) to check none.
- **Light or dark**: the page follows your system setting. Pick **Light** or **Dark** from the theme menu in the top-right corner to override it. That choice is saved in your browser; pick **System** to go back.
- Every link to another site opens in a new tab.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Screenshot of the results for &quot;acmerocket&quot;" src="docs/screenshot.png">
</picture>

## What it checks

`NAME` is the name you check, with any dot adapted for each place as described above.

| Place | Link | How it's checked |
| --- | --- | --- |
| `.com`, `.net` | `https://NAME.com` | [Verisign RDAP](https://rdap.verisign.com/), then [rdap.org](https://rdap.org/), then [Google Public DNS](https://developers.google.com/speed/public-dns/docs/doh/json) |
| `.org` | `https://NAME.org` | Public Interest Registry RDAP, then rdap.org, then Google Public DNS |
| `.app`, `.dev` | `https://NAME.app` | [Google Registry RDAP](https://pubapi.registry.google/), then rdap.org, then Google Public DNS |
| `.info`, `.io`, `.ai`, `.pro` | `https://NAME.io` | [Identity Digital RDAP](https://www.identity.digital/), then rdap.org (except `.io`), then Google Public DNS |
| `.cloud` | `https://NAME.cloud` | .cloud registry RDAP, then rdap.org, then Google Public DNS |
| `.design` | `https://NAME.design` | .design registry RDAP, then rdap.org, then Google Public DNS |
| `.tech`, `.online`, `.store` | `https://NAME.tech` | Radix RDAP, then rdap.org, then Google Public DNS |
| `.xyz` | `https://NAME.xyz` | CentralNic RDAP, then rdap.org, then Google Public DNS |
| `.shop` | `https://NAME.shop` | GMO Registry RDAP, then rdap.org, then Google Public DNS |
| `.co`, `.so` | `https://NAME.co` | Google Public DNS only, because these endings have no public registry lookup |
| Instagram | `https://www.instagram.com/NAME` | Instagram blocks lookups from browsers, so open the link to check. Marked **taken** if the handle has a Threads profile. |
| X | `https://x.com/NAME` | X oEmbed, then [FxTwitter](https://github.com/FxEmbed/FxEmbed) |
| GitHub | `https://github.com/NAME` | [GitHub REST API](https://docs.github.com/rest/users/users#get-a-user) |
| YouTube | `https://www.youtube.com/@NAME` | [Unavatar](https://unavatar.io), then [Jina Reader](https://jina.ai/reader/) |
| TikTok | `https://www.tiktok.com/@NAME` | TikTok oEmbed, then Jina Reader |
| Threads | `https://www.threads.com/@NAME` | Jina Reader |
| Facebook | `https://www.facebook.com/NAME` | Facebook Graph API (public Pages only) |
| LinkedIn | `https://www.linkedin.com/company/NAME` | Jina Reader, then [Microlink](https://microlink.io) |
| Bluesky | `https://bsky.app/profile/NAME.bsky.social`, or `https://bsky.app/profile/acme.design` for a name with a domain ending | [Bluesky public API](https://docs.bsky.app/docs/advanced-guides/api-directory) |
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
- `.co` and `.so` are checked through DNS only, so a domain without DNS records shows as **Likely available**. A registered domain can still have no records.
- The domain endings are the ones startups pick most: the classics (.com, .net, .org, .info), the tech favourites (.io, .ai, .co, .app, .dev, .so, .tech, .xyz), the ones for shops and studios (.shop, .store, .online, .design), .cloud and .pro.
- Bluesky is checked for the default `NAME.bsky.social` handle. A name with a domain ending, like `acme.design`, is checked as that domain instead, because Bluesky lets a domain's owner use it as their handle. Mastodon is checked only on the mastodon.social server. Discord is checked for a custom invite link (`discord.gg/NAME`), which only boosted servers can set; Discord usernames can't be looked up.
- A name with more than one dot keeps its ending, and its other dots become hyphens in domains: `acme.rocket.design` is checked as `acme-rocket.design`, and as `acme-rocket-design.com` on the other endings.
- Reddit blocks lookups from some networks, such as VPNs and cloud providers. The row then says **Check manually**. Names of deleted Reddit accounts can't be registered again.
- Telegram shows the same page for free, reserved and auctioned usernames, so a name nobody uses is **Likely available**. The Hacker News API is case-sensitive, so "no user" is **Likely available** too.
- The free services limit how often each IP can use them: GitHub API 60 lookups/hour, Unavatar 25/day, Jina Reader 20/minute, Microlink 5/day. Pinterest limits lookups too. When a limit is hit, that row shows **Unknown**; use its ↻ button to try again later.
- Platforms change their pages without notice, so results are best effort. Confirm before you buy a domain or print business cards.

## Privacy

The name you type is sent directly from your browser to the services above, and nowhere else. Only the services you select are asked. The page sets a strict Content Security Policy that only allows connections to those hosts. It doesn't send cookies or a referrer, and it doesn't store the names you check; your selection lives only in the page address. The only thing it saves is a Light or Dark theme you pick, in your browser's local storage.

## Development

Requires Node.js 20.19 or later. The app lives in [`site/`](site). It's a [React](https://react.dev) app built from [Primer Brand](https://primer.style/brand) components and bundled by [Vite](https://vite.dev) into static files in `dist/`.

```sh
npm install
npm run dev                       # development server with live reload at http://localhost:5173/
npm run build                     # production build in dist/
npm run preview                   # serves dist/ at http://127.0.0.1:4173/
npm run test:unit                 # lookup logic with a mocked network (node:test)
npx playwright install chromium
npm run test:e2e                  # builds, then runs UI tests against dist/ with a mocked network
LIVE_URL=https://dariusz.porowski.dev/startup-name-checker/ npm run test:live   # real services
```

The development server leaves out the Content Security Policy, because live reload needs inline scripts. The build and `npm run preview` keep it, so test there before you push.

| File | Purpose |
| --- | --- |
| [`site/index.html`](site/index.html) | Page shell and Content Security Policy |
| [`site/App.jsx`](site/App.jsx) | UI: checkboxes, result rows, retries, the theme menu and the page address |
| [`site/checker.js`](site/checker.js) | Name rules and per-platform lookups (no DOM, testable in Node) |
| [`site/main.jsx`](site/main.jsx) | Entry point: loads the Primer Brand fonts and styles |
| [`site/style.css`](site/style.css) | Page layout, using Primer Brand design tokens |
| [`site/icons.js`](site/icons.js) | Brand icons for the social platforms |
| [`site/public/theme.js`](site/public/theme.js) | Applies a saved Light or Dark theme before the page is drawn |
| [`tests/`](tests) | Unit tests, mocked UI tests and live smoke tests |

To add or change a platform, edit the `PLATFORMS` list in `site/checker.js` and add its icon to `site/icons.js`. The checkbox appears automatically; `defaultChecked` decides whether it's selected by default. If the lookup uses a new host, add that host to `connect-src` in `site/index.html`; a unit test fails when one is missing.

## Deployment

Every push to `main` runs the [CI workflow](.github/workflows/ci.yml). It builds the site, runs the tests against that build, then uploads `dist/` as an artifact and deploys it with GitHub's official Pages actions ([`configure-pages`](https://github.com/actions/configure-pages), [`upload-pages-artifact`](https://github.com/actions/upload-pages-artifact) and [`deploy-pages`](https://github.com/actions/deploy-pages)). There's no publishing branch. Then it runs the [Live check workflow](.github/workflows/live-check.yml), which tests the deployed page against the real services. You can also run the live check manually from the Actions tab.

Every action is pinned to a full commit SHA, with its version in a comment.

To set this up, for example in a fork:

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Environments → github-pages**, make sure **Deployment branches and tags** allows `main`.
3. Push to `main`, or run the CI workflow from the Actions tab.

## Credits

- UI components, design tokens and the Mona Sans and Hubot Sans typefaces from [Primer Brand](https://github.com/primer/brand) (MIT; fonts under the SIL Open Font License). UI icons from [Octicons](https://github.com/primer/octicons) (MIT).
- Brand icons from [Simple Icons](https://simpleicons.org) (CC0). Brand names and logos belong to their owners. This project isn't affiliated with any of them.
- [Avatars provided by Unavatar](https://unavatar.io).

## License

[MIT](LICENSE)
