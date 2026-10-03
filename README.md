# Atmosphere Account Launcher

A small, MIT-licensed, static wizard: Atmosphere primer → provider selection → provider-native OAuth signup → completion → optional return to the originating app.

Vite, vanilla TypeScript, SCSS, i18next, and the official `@atproto/oauth-client-browser`. No application backend, account database, PDS hosting, analytics, or token handoff.

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

`npm run build` creates `dist/`, including `index.html`, `callback.html`, `oauth-client-metadata.json`, `/v1/providers.json`, and bundled assets. Serve it at an origin's root; no rewrite rules or runtime Node.js are required.

Configuration is validated when Vite starts/builds. Tests cover parsing, app lookup and fallback, redirect allowlisting, interpolation, recovered callback context, countdown controls, and recoverable UI failures.

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
  "logo": "/providers/new-provider.svg",
  "enabled": true
}
```

Add the description at `providers.newProvider` in `locales/en.json`. If using `logo`, put the asset at `public/providers/new-provider.svg`; otherwise omit it. Logos are optional, same-site absolute paths, and decorative inside the named provider button. IDs, URLs, required fields, and duplicates are validated. Disabled providers stay in the public registry but do not appear in the picker.

Use the PDS **or provider entryway** URL accepted by ATProto OAuth, not an arbitrary signup homepage or a user's eventual physical PDS. Confirm the provider supports server-first OAuth account creation. Do not duplicate the list in UI code or `public/`.

## Add an app/theme

Create **`apps/your-app/config.json`**:

```json
{
  "id": "your-app",
  "appName": "Your App",
  "redirectUrl": "https://your-app.example/welcome",
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
- All five theme fields are required. Colors use six-digit hex; choose readable contrast, especially white button text against `primaryColor`. `fontFamily` uses available system fonts unless you supply local font assets and SCSS.
- `redirectUrl` is optional, repository-reviewed, HTTPS, and cannot contain URL credentials. Omit it to show completion without navigation.
- Optional top-level `logo` uses a same-site path such as `/apps/your-app/logo.svg`; put the corresponding asset at `public/apps/your-app/logo.svg`.
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
| `logo` | string, optional | Same-site path; resolve against the registry origin |
| `enabled` | boolean | Whether the launcher offers this provider |

Consumers should honor `enabled`. Changes incompatible with this schema require a new `/v2/` resource. The public file is generated; edit only the contributor source. For browser consumers on other origins, configure your static host to send `Access-Control-Allow-Origin: *` on this JSON resource. This is a static-host header, not an API server.

## Verification limits

Live signup initiation has been exercised against Bluesky and Eurosky. A real Bluesky cancellation callback verified context recovery. Successful completion, countdown, safe return, and error recovery are exercised through the small `SignupOAuth` boundary; automated checks do not create provider accounts or emulate an OAuth server. A complete live signup/token-exchange run requires a test account, provider verification steps, and the deployed origin. Perform that check before production release.

## License

MIT; see `LICENSE`.
