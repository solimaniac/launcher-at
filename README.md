# Atmosphere Account Launcher

A small, MIT-licensed, static wizard: Atmosphere primer → provider selection → provider-native OAuth signup → completion → optional return to the originating app.

Vite, vanilla TypeScript, SCSS, i18next, and the official `@atproto/oauth-client-browser`. The launcher remains static; no account database, PDS hosting, or token handoff.

Generic screens display **Launcher** with the supplied image at `public/logo.png`. App screens retain their configured name and can replace the header logo through `logo_url`. Browser favicons remain `public/favicon.png`, a 64×64 PNG with transparent background and antialiased edges; their URL includes `?v=transparent` to bypass cached copies of the old black-background favicon.

Both launcher and callback screens include a small, muted footer beneath the main panel: the version from `package.json`, followed by “view source code on GitHub”, with only “GitHub” linking to [this repository](https://github.com/solimaniac/launcher-at). The sentence prefix is translated through `site.source`; the link retains keyboard focus styling.

The optional [activity backend](server/README.md) runs as one Node process with Redis. It observes Jetstream account hosting transitions and exposes provider counts and the most recent joins. It reads the same `config/providers.json`.

### Activity display

Set **PUBLIC_ACTIVITY_API** (build time, like `PUBLIC_ORIGIN`) to the backend's origin, e.g. `https://server-production-1e48d.up.railway.app`, and add the launcher's origin to the backend's `ALLOWED_ORIGINS`. Unset, no activity requests are made.

- On page load the launcher fetches `/api/v1/providers/counts` once and shows "N joined in the last 30 days" on each provider card. Values of 1,000 and above are truncated to compact form with `+` (`1K+`, `10K+`, `1M+`). The picker defaults to descending join counts and updates its ordering when counts arrive. Equal counts sort A–Z; providers without counts follow providers with counts, including zero. If activity is disabled or the request fails, counts remain hidden and the default sort falls back to A–Z.
- `src/activity.ts` polls `/api/v1/joins/recent?limit=50` every 30 seconds while the tab is visible, the window is focused, and the user has interacted within the last five minutes (`IDLE_MS`). Hiding the tab, leaving the window, or reaching that idle deadline pauses both polling and new join reveals. Returning to the page or interacting through pointer, keyboard, or scrolling resumes the feed; an overdue poll runs immediately, but the normal interval and `Retry-After` deadlines still apply. An already-running request may finish while paused, but its joins wait until the page is active. The feed hands at most one new join to its caller every 3 seconds. Entries already shown are never repeated, and surplus older entries are dropped so the display stays current. Failures back off exponentially, up to five minutes, and respect `Retry-After`. The callback page does not poll.
- Each join appears as a rocket launch in the background sky (`src/background/`): a thin trajectory line drawn behind a small rocket mark, with "*handle* joined on *Provider* *logo*" trailing behind it. The sentence follows the curved trajectory using SVG `textPath`. The provider's configured local logo occupies a 12×12-pixel box with preserved aspect ratio. Its position and rotation follow the final rendered glyph, with four pixels of clearance beyond that glyph's bounds projected onto its tangent, rather than a large fixed path gap. The logo stays hidden until the final glyph is on the path. Unknown providers or providers without a logo retain text-only labels. Flights rise from the bottom edge and pitch over to the right over 18 seconds, giving the label more reading time, then fade out over 1.2 seconds; at most seven are visible at once so flights finish at the three-second reveal cadence. With `prefers-reduced-motion`, a launch shows as a still, partly drawn trajectory that fades in and out. The layer has `aria-hidden` and ignores pointer events. `startJoinFeed(load, show)` does not render anything itself, and `createLaunchLayer(container)` only exposes `launch({ text, logo? })` and `dispose()`, so either side can be replaced on its own.
- Animation labels show only the first dot-separated part of each handle (`user.bsky.social` → `user`) for every provider, including custom-domain handles. The API data and feed deduplication retain the full handle.
- Below 768px, the page reserves extra sky beneath the content and source footer: bottom padding is `30svh`, bounded between `10rem` and `18rem`. Scroll to the bottom to see the launch animation unobstructed; desktop spacing is unchanged.
- Budget: the backend allows 120 requests per client IP and 1,200 per process per minute by default (`RATE_LIMIT_PER_MINUTE`, `GLOBAL_RATE_LIMIT_PER_MINUTE`). One active tab uses about 2 requests per minute, so roughly 60 tabs behind one shared IP, or 600 active visitors per process, fit within those limits. Hidden, unfocused, and idle tabs do not poll. If you change the server limits or the traffic you expect, revisit `POLL_MS` in `src/activity.ts`.

## Run locally

Node.js 22.12+ (or a current Node.js LTS) and npm:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open **http://127.0.0.1:5173/**. Use the IP address, not `localhost`, so OAuth leaves and returns to the same browser-storage origin. The development port is fixed; if changing it, set `PUBLIC_ORIGIN=http://127.0.0.1:YOUR_PORT` to match. `npm run preview` serves the built files on Vite's preview port; live OAuth requires visiting the exact origin used when building metadata.

`npm run build` creates `dist/`, including `index.html`, `callback.html`, `oauth-client-metadata.json`, `/v1/providers.json`, bundled assets, and branded HTML/PNG previews under `/embeds/`. Serve it at an origin's root; no runtime Node.js is required. App-specific previews for `?app=...` require the query-aware static-host routing described below.

Configuration is validated when Vite starts/builds. Tests cover parsing, app lookup and fallback, redirect allowlisting, interpolation, recovered callback context, countdown controls, and recoverable UI failures.

### Rich link previews

Shared links expose Open Graph and Twitter Card text plus a 1200×630 PNG. The default preview uses the launcher's headline and branding. Registered `/?app=your-app` links use **Sign up for Your App**, the app-specific introduction, configured theme colors and font, and `logo_url` (or the launcher logo). Unknown IDs fall back to the generic preview. The minimalist composition preserves the page's tinted sky, rounded panel, and left-aligned typography, following the [Taste Skill guidance](https://github.com/Leonxlnx/taste-skill).

Metadata is delivered in the initial HTML: crawlers do not need JavaScript. Vite development and preview servers select the correct document automatically. In production, the root `Caddyfile` imports generated `dist/embed-routes.caddy` and internally rewrites known app query URLs to their prebuilt HTML, retaining the original URL and normal signup behavior. [Railpack supports a root Caddyfile](https://railpack.com/languages/node/). Other static hosts must implement equivalent query-aware rewrites; serving only `index.html` gives every shared URL the generic preview.

Set `PUBLIC_ORIGIN` to the public site origin before building so image and page URLs are accessible to external crawlers. Loopback URLs cannot be fetched by other websites. Redeploy after changing app branding; sharing platforms may cache older previews. Their presentation of title, description, image, and cropping remains platform-controlled.

Preview PNGs are generated at build time with `@resvg/resvg-js`; remote app logos must be reachable and renderable during the build. Fonts available on the build machine are used when configured; bundled Noto Sans regular/bold supplies the system-ui and missing-font fallback. To match a custom font exactly, add its licensed font files to `build/fonts/` and the renderer's `fontFiles` list. Bundled Noto Sans is covered by `build/fonts/OFL.txt` and is not shipped to browser clients.

## Production and OAuth development

Set **PUBLIC_ORIGIN** to the site's actual public HTTPS origin, with no trailing slash, path, credentials, query, or custom port. Copy `.env.example` to `.env.local` and set it there, or supply it through the environment:

```sh
PUBLIC_ORIGIN=https://your-launcher.example npm run build
```

PowerShell:

```powershell
$env:PUBLIC_ORIGIN = 'https://your-launcher.example'
npm run build
```

Deploy `dist/` unchanged. The authorization server must be able to GET `https://your-launcher.example/oauth-client-metadata.json` with HTTP 200 and `Content-Type: application/json` (not an HTML fallback or redirect). Rebuild if the origin changes.

Without `PUBLIC_ORIGIN`, builds use the local development origin. **Do not deploy that metadata as production configuration.** Public HTTPS metadata advertises only `atproto`, the authorization-code grant, a public web client, and DPoP-bound tokens. The official localhost development exception includes `refresh_token` in its virtual metadata; this is protocol-defined, not a production permission choice.

For end-to-end testing on a publicly discoverable client ID, expose the site through a public HTTPS host/tunnel, set `PUBLIC_ORIGIN` to it, restart the dev server, and open that HTTPS URL for the entire flow. Providers must support the localhost exception to run OAuth without a public origin. No client secret is needed.

### Railway deployment

Project **launcher-at**, environment **production**, service **website**: [https://website-production-0a83.up.railway.app](https://website-production-0a83.up.railway.app). Railpack builds from the repository root using `npm run build` and serves `dist/` with Caddy; no Vite development/preview server runs in production.

Website service variables:

- `PUBLIC_ORIGIN=https://website-production-0a83.up.railway.app`
- `PUBLIC_ACTIVITY_API=https://server-production-1e48d.up.railway.app`
- `RAILPACK_NODE_VERSION=24`
- `RAILPACK_SPA_OUTPUT_DIR=dist`

Deploy from the repository root, linked to `launcher-at`:

```sh
railway up --service website --environment production --ci
```

The backend's `ALLOWED_ORIGINS` is the website's exact HTTPS origin, without a wildcard. Changing the website domain requires rebuilding with the new `PUBLIC_ORIGIN` and updating the backend allowlist; changing the API domain requires rebuilding with the new `PUBLIC_ACTIVITY_API`. Follow the [backend stop-before-deploy procedure](server/README.md#provisioned-production-deployment) when applying backend configuration changes so Jetstream consumers never overlap.

Deployment verification: the public OAuth metadata returned JSON with the production client ID and callback URL; Chromium loaded all 11 provider counts and the recent-joins feed through successful cross-origin API requests. Allowed-origin preflight returned 204; an unlisted origin received no `Access-Control-Allow-Origin` header. Full provider account creation was not exercised.

### OAuth boundary and callback

- `src/oauth.ts` uses `BrowserOAuthClient.signInRedirect(provider.serviceUrl, ...)`, without a handle or DID. It requests `scope: 'atproto'` and `prompt: 'create'`; account creation stays on the provider's authorization interface, not its social application.
- The SDK owns discovery, PAR, PKCE, DPoP, CSRF state, token exchange, and identity/issuer verification. Providers can still offer existing-account authentication; OAuth success establishes an authenticated account, not independent proof that it was newly created.
- The SDK's application-state option carries only the known app ID. Its wire-level security state remains generated and verified by the SDK. No arbitrary return URL is accepted.
- `/callback.html` is a real static file. The response uses a URL fragment so authorization codes are not sent to the static host. The callback removes response parameters, calls `initCallback`, obtains the authenticated DID, and calls `session.signOut()` to revoke/discard the launcher-owned session. This does not log out the provider's ordinary browser session.
- Completion uses the recovered app ID to look up repository configuration. Configured return URLs receive an immediate CTA and five-second automatic return; **Stay here** cancels it. No DID or token is appended to the return URL. The destination app authenticates separately.
- No ongoing session is restored. The DID is neither displayed nor reported by the launcher. The SDK may perform the identity resolution required to authenticate it.

Official references: [AT Protocol OAuth specification](https://atproto.com/specs/oauth), [OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client), [browser OAuth client](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-browser).

## Add a provider

Edit **`config/providers.json`**, the single provider source. Add an object:

```json
{
  "id": "new-provider",
  "name": "New Provider",
  "serviceUrl": "https://accounts.example.org",
  "description": "providers.newProvider",
  "region": "Europe",
  "logo": "/providers/new-provider.svg",
  "enabled": true
}
```

Add the description at `providers.newProvider` in `locales/en.json`. `region` is required plain text naming the country/region where the provider hosts accounts (e.g. `"United States"`, `"Europe"`); it appears below the provider name alongside a decorative flag. United States, Europe, Canada, and Japan map to 🇺🇸, 🇪🇺, 🇨🇦, and 🇯🇵; other regions use 🌐. Emoji rendering depends on platform support. Flags are hidden from assistive technology; the region text and provider description remain the button's accessible description. If using `logo`, put the asset at `public/providers/new-provider.svg`; otherwise omit it. Provider logos are optional, same-site absolute paths, and decorative inside the named provider button. IDs, URLs, required fields, and duplicates are validated. Disabled providers stay in the public registry but do not appear in the picker.

Set optional `requiresInvite: true` for providers that require an invite code before signup. The picker displays an “Invite code required” pill and includes the requirement in the button's accessible name; selection still opens the provider's signup flow. Omit the field or set it to `false` to show no invite pill. Northsky is currently marked as invite-only.

The picker follows the [Taste Skill redesign guidance](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md), preserving the launcher's typography, theme colors, logos, focus styling, and rounded controls. Design dials: `DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 5`. It uses native controls and the existing SCSS rather than adding a second design system.

Filters and sorting stay collapsed behind a quiet **Filter & sort** button above the provider cards. It exposes a labeled panel on demand with keyboard-accessible controls and an `aria-expanded` state. Active filters show a compact result count, the number of selected filter options, and **Clear filters** even when the panel is closed; clearing preserves the sort and returns focus to a visible control. With no active filters, only the disclosure button is shown.

The **Sort by** dropdown offers name A–Z and name Z–A. Join count (high to low, default) is included only when counts are available for at least one enabled provider; a measured zero counts as available. While loading, after failure, or with empty/unrelated count data, the dropdown shows A–Z as the fallback. Late counts add join-count sorting and apply it unless the user explicitly chose an alphabetical sort. Region checkboxes are generated from enabled providers; selecting multiple regions matches any selected region, and leaving all unchecked includes every region. The **Invite codes** dropdown includes all providers, only those requiring an invite, or only those not requiring one. Region and invite filters combine. Choices persist when returning to the picker or retrying a failed signup, with the panel initially collapsed. Late counts preserve filters and the focused provider. All picker controls disable while signup opens.

Provider cards use two columns from 768px and one column below; the dropdowns stack below 480px, and region choices wrap. Provider logos retain a white backing for legibility with custom background colors.

### Provider logo assets

All 11 configured providers have local assets in `public/providers/`. The picker uses a shared 48×48 CSS-pixel box (`3rem`) with `object-fit: contain`, preserving each mark's aspect ratio. Eight assets are SVGs; Eurosky and Witchcraft Systems use PNGs. selfhosted.social uses its original 48×48 favicon converted losslessly to PNG without upscaling. Wide or tall marks occupy less of the square box.

| Provider | Source asset | Format / source size |
| --- | --- | --- |
| Bluesky | [Official media-kit butterfly](https://bsky.social/about/brand-assets/butterfly/bluesky_media_kit_logo_transparent_1.svg) | SVG, 568×501 |
| Eurosky | [Official portal icon](https://portal.eurosky.tech/icons/android-icon-192x192.png) | PNG, 184×184 |
| Blacksky | [Blacksky Algorithms mark](https://commons.wikimedia.org/wiki/File:Blacksky_Algorithms_Logo_(black).svg), attributed to blackskyweb.xyz | SVG, approximately 88×75 |
| W Social | [Official homepage splash SVG](https://wsocial.eu/) | SVG, 73×73 viewBox |
| Northsky | [Official color icon](https://northskysocial.ca/northsky-icon-color.svg) | SVG, 1024×1024 viewBox |
| selfhosted.social | [Official favicon](https://selfhosted.social/_app/immutable/assets/favicon.D87KDQmG.ico) | PNG conversion, 48×48 |
| Tangled | [Official Dolly mark](https://assets.tangled.network/tangled_dolly_face_only_black_on_trans.svg) | SVG, approximately 24×23 |
| Spark | [Official icon](https://sprk.so/icon.svg) | SVG, 551×551 |
| npmx | [Official cute logo](https://npmx.dev/extra/npmx-cute.svg) | SVG, 246×112 |
| pckt | [Official favicon](https://pckt.blog/favicon.svg) | SVG, 93×107 |
| Witchcraft Systems | [Official homepage base artwork](https://witchcraft.systems/img/WitchSysBase.png) | PNG, 256×512 |

These assets identify their respective providers; the launcher's MIT license does not grant rights to provider trademarks. Follow [Bluesky's brand guidelines](https://bsky.social/about/support/branding). Commons lists the Blacksky mark as public domain; explicit redistribution licenses were not established for the other assets. Witchcraft Systems uses its homepage base artwork rather than the site's animated accent overlay.

Use the PDS **or provider entryway** URL accepted by ATProto OAuth, not an arbitrary signup homepage or a user's eventual physical PDS. Confirm the provider supports server-first OAuth account creation. Do not duplicate the list in UI code or `public/`.

## Atmosphere application catalog

`config/atmosphere-apps.json` contains the application directory data, separate from OAuth providers and launcher app/theme configurations. Each entry has `name`, `url` (the application's HTTPS homepage, without tracking parameters), and `logo` (a root-relative path under `/atmosphere-apps/`). Logo files live in `public/atmosphere-apps/` and are served unchanged by Vite. Apps without an available logo are omitted rather than given placeholder assets.

This is data for a future application list; it does not add a launcher screen or a public JSON endpoint. To add an application, save its official logo in `public/atmosphere-apps/` and add the matching entry to the catalog. These assets identify their respective applications; the launcher's MIT license does not grant rights to their trademarks.

## Add an app/theme

Create **`apps/your-app/config.json`**:

```json
{
  "id": "your-app",
  "appName": "Your App",
  "redirectUrl": "https://your-app.example/welcome",
  "logo_url": "https://your-app.example/logo.png",
  "theme": {
    "primaryColor": "#1859b8",
    "secondaryColor": "#e5edfa",
    "backgroundColor": "#f7f9fc",
    "textColor": "#172238",
    "fontFamily": "system-ui, sans-serif"
  }
}
```

- Match the directory name and ID. IDs use lowercase letters/numbers with single hyphen separators. App names are required.
- All five theme fields are required. Colors use six-digit hex. Primary buttons automatically choose black or white text for the higher WCAG contrast against `primaryColor`. Choose `textColor` with at least 4.5:1 contrast against both `backgroundColor` and `secondaryColor`; arbitrary theme combinations are not automatically corrected. `fontFamily` uses available system fonts unless you supply local font assets and SCSS.
- All foreground UI sits inside one solid rounded panel using `backgroundColor`, with a subtle border and shadow and responsive padding. App names and optional logos remain visible on every screen. The intro places its primary action before the explanatory list; benefits and providers collapse explicitly to one column below 768px. Actions are at least 48px high and become full-width below 480px. Keyboard focus rings, screen-heading focus, reduced-motion feedback, and forced-color borders are supported. Configured colors remain authoritative rather than being replaced by an automatic dark palette.
- `redirectUrl` is optional, repository-reviewed, HTTPS, and cannot contain URL credentials. Omit it to show completion without navigation.
- Optional top-level `logo_url` replaces the supplied launcher image in the header. Supply an absolute HTTPS image URL such as `https://your-app.example/logo.png`; no image file needs to be added to this project. Local paths, HTTP, protocol-relative URLs, and embedded credentials are rejected. Remote image requests omit the referrer. The header logo's height is 1.5 times the brand text's capital-letter height (`1.5cap`), with automatic width preserving the image's aspect ratio. Omit `logo_url` to use `public/logo.png`. Provider configuration still uses `logo` with local asset paths.
- Optional `launchAnimation: false` turns off the background rocket launches for that app, and the recent-joins poll is skipped too. It is on when omitted. Provider join counts are unaffected. The sky gradient is always shown and is tinted from `primaryColor` and `backgroundColor`.
- Link to **`https://your-launcher.example/?app=your-app`**. Configurations are discovered automatically at build time; no application-code edit is needed.
- `apps/default/config.json` is generic and cannot contain a return URL. Unknown/invalid app IDs show a translated notice and fall back to the default without redirecting. Query parameters such as `redirect=` are ignored.

`apps/example-app/config.json` demonstrates branding and a fictional return destination at `https://example.com/`; replace it for a real integration.

## Add a translation

English UI strings, accessibility labels, and errors live in **`locales/en.json`**, using conventional nested i18next keys and `{{appName}}` interpolation. App/provider names belong to their repository configurations. UI text is inserted as text, never HTML.

Add `locales/fr.json` with the same keys, register it in `src/i18n.ts` under `resources`, and enable your chosen language detection/selection in the i18next initializer. Use i18next's `_one`/`_other` plural forms for countdowns. No language selector or detector is included in this English-only release.

## Static provider API

**GET `/v1/providers.json`** returns a JSON array generated from `config/providers.json`. The `v1` fields are:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable provider ID |
| `name` | string | Provider display name |
| `serviceUrl` | string | HTTPS PDS/entryway URL for OAuth |
| `description` | string | English text resolved from the locale key |
| `region` | string | Country/region where the provider hosts accounts |
| `logo` | string, optional | Same-site path; resolve against the registry origin |
| `enabled` | boolean | Whether the launcher offers this provider |
| `requiresInvite` | boolean, optional | Whether signup requires an invite code beforehand; omitted means no invite requirement |

Consumers should honor `enabled`. Changes incompatible with this schema require a new `/v2/` resource. The public file is generated; edit only the contributor source. For browser consumers on other origins, configure your static host to send `Access-Control-Allow-Origin: *` on this JSON resource. This is a static-host header, not an API server.

## Verification limits

Live signup initiation has been exercised against Bluesky and Eurosky. A real Bluesky cancellation callback verified context recovery. Successful completion, countdown, safe return, and error recovery are exercised through the small `SignupOAuth` boundary; automated checks do not create provider accounts or emulate an OAuth server. A complete live signup/token-exchange run requires a test account, provider verification steps, and the deployed origin. Perform that check before production release.

## License

MIT; see `LICENSE`.
