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

It stores no accounts or tokens. An optional [activity backend](server/README.md) adds join counts and a live "recent signups" animation.

## Add your app

Each app gets its own branded launcher at `/?app=<id>`.

1. Create `apps/<id>/config.json`:

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

2. Link people to `/?app=your-app`. Apps are picked up automatically at build time.

| Field             | Required | Notes                                                                                         |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `id`              | yes      | Same as the directory name. Lowercase letters, digits and single hyphens.                     |
| `appName`         | yes      | Shown in the header and page title.                                                           |
| `theme.*`         | yes      | All five fields. Colors are six-digit hex; button text color is picked for contrast.          |
| `redirectUrl`     | no       | HTTPS URL to send people back to after signup (8-second countdown). Omit to stay on the page. |
| `logo_url`        | no       | HTTPS image URL for the header. Defaults to the launcher logo.                                |
| `launchAnimation` | no       | Set to `false` to hide the background rocket launches.                                        |

Good to know:

- Pick a `textColor` with at least 4.5:1 contrast against both `backgroundColor` and `secondaryColor`.
- Unknown `?app=` IDs fall back to `apps/default`, which can't redirect.
- See [`apps/example-app`](apps/example-app/config.json) and [`apps/example-app-dark`](apps/example-app-dark/config.json) for Bluesky light and dark examples. Both redirect to `https://bsky.app/`; colours come from [Bluesky's ALF palette](https://www.npmjs.com/package/@bsky.app/alf) (`primary_500` in light mode, `primary_600` in dark mode, plus `bg_contrast_50`, `bg` and `text`). The dark example uses the black-background dark theme, not the separate dim theme.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** (use the IP, not `localhost`, so OAuth returns to the same origin). Try an app with http://127.0.0.1:5173/?app=example-app.

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                    |
| `npm test`          | Unit tests (Vitest)                           |
| `npm run lint`      | ESLint + Prettier check (frontend and server) |
| `npm run format`    | Auto-fix lint and formatting                  |
| `npm run typecheck` | TypeScript checks                             |
| `npm run build`     | Production build into `dist/`                 |
| `npm run preview`   | Serve the built `dist/`                       |

To show join counts and launches locally, run the [backend](server/README.md) and set `PUBLIC_ACTIVITY_API=http://127.0.0.1:3000` in `.env.local`.

## Configuration

Set these at build time, in the environment or in `.env.local` (see [`.env.example`](.env.example)):

| Variable              | Description                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`       | Public HTTPS origin of the site, e.g. `https://launcher.at`. **Required in production** for OAuth. |
| `PUBLIC_ACTIVITY_API` | Origin of the activity backend. Leave unset to disable activity features.                          |

## Deploy

```sh
PUBLIC_ORIGIN=https://your-launcher.example npm run build
```

Serve `dist/` from the root of that origin. It must return `/oauth-client-metadata.json` as JSON (not an HTML fallback). The included [`Caddyfile`](Caddyfile) does this and also serves per-app link previews for `/?app=<id>`; other hosts need an equivalent rewrite using the generated `dist/embed-routes.caddy`.

Rebuild whenever the origin or app branding changes.

## Other configuration

- **Providers**: [`config/providers.json`](config/providers.json). Each entry needs an `id`, `name`, `serviceUrl` (the PDS or entryway used for OAuth), `description` (a key in `locales/en.json`), `region` and `enabled`. `logo` (a path under `public/providers/`) and `requiresInvite` are optional. The list is also published as `/v1/providers.json`.
- **App directory**: [`config/atmosphere-apps.json`](config/atmosphere-apps.json) lists the apps shown after a generic signup. Logos live in `public/atmosphere-apps/`.
- **Text**: all UI strings are in [`locales/en.json`](locales/en.json).

Region flags are mapped in `src/launcher.ts`; add a flag when introducing a new region. Unmapped regions use a globe.

Provider and app logos belong to their owners. The MIT license doesn't cover them.

## Project layout

```
apps/       Per-app branding (one config.json each)
config/     Providers and the app directory
locales/    UI strings
src/        Browser code: launcher screens, OAuth, activity feed, background animation
build/      Build-time plugins: OAuth metadata and link-preview images
server/     Optional activity backend
```

## License

[MIT](LICENSE)
