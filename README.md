<h1 align="center">
  <img src="public/logo.png" alt="" height="64" align="center" />
  launcher.at
</h1>

<p align="center">
  A friendly signup page for the <a href="https://atproto.com">Atmosphere</a>.<br />
  Pick a provider, create an account, and head back to the app that sent you.
</p>

---

launcher.at is a static site (Vite + TypeScript, no framework). It explains the Atmosphere, lets people choose an account provider, and sends them through that provider's own OAuth signup. When they're done, it can send them back to your app.

It stores no accounts or tokens and needs no runtime backend.

## Add your app

Each app gets its own branded launcher at `/?app=<id>`.

1. Create `apps/<id>/config.json`:

   ```json
   {
     "id": "your-app",
     "appName": "Your App",
     "redirectUrl": "https://your-app.example/welcome",
     "logo_url": "https://your-app.example/logo.png",
     "providerAllowlist": ["eurosky", "blacksky"],
     "theme": {
       "primaryColor": "#1859b8",
       "secondaryColor": "#e5edfa",
       "backgroundColor": "#f7f9fc",
       "textColor": "#172238",
       "fontFamily": "system-ui, sans-serif"
     }
   }
   ```

2. Link people to `/?app=your-app`. Apps are picked up automatically at build time.

| Field               | Required | Notes                                                                                                                               |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | yes      | Same as the directory name. Lowercase letters, digits and single hyphens.                                                           |
| `appName`           | yes      | Shown in the header and page title.                                                                                                 |
| `theme.*`           | yes      | All five fields. Colors are six-digit hex; button text color is picked for contrast.                                                |
| `redirectUrl`       | no       | HTTPS URL to send people back to after signup (8-second countdown). Omit to stay on the page.                                       |
| `logo_url`          | no       | HTTPS image URL for the header. Defaults to the launcher logo.                                                                      |
| `providerAllowlist` | no       | Non-empty array of unique provider IDs from `launcher-pds-dir`. Omit to show all enabled providers. Disabled providers stay hidden. |

Good to know:

- Pick a `textColor` with at least 4.5:1 contrast against both `backgroundColor` and `secondaryColor`.
- Unknown `?app=` IDs fall back to `apps/default`, which can't redirect.
- See [`apps/example-app`](apps/example-app/config.json) and [`apps/example-app-dark`](apps/example-app-dark/config.json) for Bluesky light and dark examples. Both redirect to `https://bsky.app/`; colours come from [Bluesky's ALF palette](https://www.npmjs.com/package/@bsky.app/alf) (`primary_500` in light mode, `primary_600` in dark mode, plus `bg_contrast_50`, `bg` and `text`). The dark example uses the black-background dark theme, not the separate dim theme.
- The examples use official [Bluesky butterfly SVGs](https://bsky.social/about/support/icons): blue in light mode and white in dark mode, loaded via `logo_url`.
- Both example apps allow every current provider except Bluesky. Allowlists are explicit: add new provider IDs to them when needed. Unknown IDs, duplicates and empty lists fail configuration validation.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** (use the IP, not `localhost`, so OAuth returns to the same origin). Try an app with http://127.0.0.1:5173/?app=example-app.

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | Dev server with hot reload    |
| `npm test`          | Unit tests (Vitest)           |
| `npm run lint`      | ESLint + Prettier check       |
| `npm run format`    | Auto-fix lint and formatting  |
| `npm run typecheck` | TypeScript checks             |
| `npm run build`     | Production build into `dist/` |
| `npm run preview`   | Serve the built `dist/`       |

## Configuration

Set these at build time, in the environment or in `.env.local` (see [`.env.example`](.env.example)):

| Variable        | Description                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN` | Public HTTPS origin of the site, e.g. `https://launcher.at`. **Required in production** for OAuth. |

## Other configuration

- **Providers**: the [launcher-pds-dir](https://github.com/solimaniac/launcher-pds-dir) package is the single source for provider metadata and logos. The build preserves `/v1/providers.json` and `/providers/*` for existing clients. Update the directory package to change hosts; there is no local provider snapshot.
- **App directory**: [`config/atmosphere-apps.json`](config/atmosphere-apps.json) lists the apps shown after a generic signup. Logos live in `public/atmosphere-apps/`.
- **Text**: all UI strings are in [`locales/en.json`](locales/en.json).

Provider and app logos belong to their owners. The MIT license doesn't cover them.

## Project layout

```
apps/       Per-app branding (one config.json each)
config/     App discovery directory
locales/    UI strings
src/        App branding, return destinations, OAuth client setup, discovery
build/      Build-time plugins: OAuth metadata and link-preview images
```

## Reusable packages

[launcher-components](https://github.com/solimaniac/launcher-components) provides the framework-independent flow, unstyled DOM screens, provider picker, and OAuth adapter. [launcher-pds-dir](https://github.com/solimaniac/launcher-pds-dir) provides the typed host directory and assets. This app uses both, while retaining its branding and configured return destinations.

The components repository separates language implementations from shared JSON flow contracts, copy, and conformance cases, so a future Dart/Flutter package can use the same behavior and PDS data independently of JavaScript.

The launcher uses signup-only mode and discards its temporary OAuth session. Apps using the components directly can support existing-account login, retain their own SDK session, and choose inline, full-screen, or dialog presentation. Neither package is published to npm yet. Until the requested separate GitHub repositories can be created, dependencies are pinned to standalone package commits on the `codex/launcher-components` and `codex/launcher-pds-dir` branches of this repository. Move those same commits into the new repositories, then update the Git URLs; no source changes are needed.

## License

[MIT](LICENSE)
