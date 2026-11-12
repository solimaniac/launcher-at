<h1 align="center">
  <img src="public/logo.png" alt="" height="64" align="center" />
  launcher.at
</h1>

<p align="center">
  An interactive demo of <a href="https://github.com/apogeekit/launcher-components">@apogeekit/launcher-components</a>.<br />
  Try Atmosphere login in a dialog, an inline form, or a full-screen flow.
</p>

---

launcher.at is a static site (Vite + TypeScript, no framework). The homepage is a component playground with simulated sign-ins. Try account flows, three appearances, English/Spanish, provider allowlists, custom hosts, error recovery, and the standalone host picker. The implementation panel shows matching TypeScript, including redirect or popup OAuth adapters.

The existing live signup flow remains at `/?app=default` and `/?app=<id>`. It explains the Atmosphere and continues on the selected provider’s website. Configured apps can send users back after signup.

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

| Field               | Required | Notes                                                                                                                                      |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                | yes      | Same as the directory name. Lowercase letters, digits and single hyphens.                                                                  |
| `appName`           | yes      | Shown in the header and page title.                                                                                                        |
| `theme.*`           | yes      | All five fields. Colors are six-digit hex; button text color is picked for contrast.                                                       |
| `redirectUrl`       | no       | HTTPS URL to send people back to after signup (8-second countdown). Omit to stay on the page.                                              |
| `logo_url`          | no       | HTTPS image URL for the header. Defaults to the launcher logo.                                                                             |
| `providerAllowlist` | no       | Non-empty array of unique provider IDs from `@apogeekit/pds-registry`. Omit to show all enabled providers. Disabled providers stay hidden. |

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

- **Providers**: the [@apogeekit/pds-registry](https://github.com/apogeekit/pds-registry) package is the single source for provider metadata and logos. The build preserves `/v1/providers.json` and `/providers/*` for existing clients. Update the directory package to change hosts; there is no local provider snapshot.
- **App directory**: [`config/atmosphere-apps.json`](config/atmosphere-apps.json) lists the apps shown after a generic signup. Logos live in `public/atmosphere-apps/`.
- **Text**: all UI strings are in [`locales/en.json`](locales/en.json).

Provider and app logos belong to their owners. The MIT license doesn't cover them.

## Project layout

```
apps/       Per-app branding (one config.json each)
config/     App discovery directory
locales/    UI strings
src/        Demo playground, app branding, return destinations, OAuth setup, discovery
build/      Build-time plugins: OAuth metadata and link-preview images
```

## Reusable packages

[@apogeekit/launcher-components](https://github.com/apogeekit/launcher-components) provides the framework-independent flow, unstyled DOM screens, provider picker, and OAuth adapter. [@apogeekit/pds-registry](https://github.com/apogeekit/pds-registry) provides the typed host directory and assets. This app uses both, while retaining its branding and configured return destinations.

The components repository keeps the TypeScript implementation in `ts/`, translations in `locales/`, and shared behavior fixtures in `tests/`. Future implementations such as Dart/Flutter can live beside `ts/` and use the same PDS data.

The live launcher uses signup-only mode and discards its temporary OAuth session. The playground uses a local adapter that never contacts a provider or stores a session. Apps using the components directly can support existing-account login, retain their own SDK session, and choose inline, full-screen, or dialog presentation. Neither package is published to npm yet. Dependencies are pinned to immutable commits in their separate GitHub repositories. This repository remains the sample website, with development and build commands run from the root.

## License

[MIT](LICENSE)
