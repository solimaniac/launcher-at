# launcher-at

The existing launcher.at website is an example consumer of the reusable Atmosphere login packages. Its source, branding, translations, assets, and build helpers live under [`example/`](example/); see its [setup guide](example/README.md).

```sh
npm ci
npm run dev
```

Run commands from the repository root. `npm run build` writes the website to `dist/`; `npm run preview` serves it. Root tooling and the Caddy configuration remain here.

The intended repository layout is:

- **launcher-at**: the website under `example/`.
- **launcher-components**: language-specific implementations, shared flow contracts, copy, and behavior fixtures.
- **launcher-pds-dir**: the provider directory, metadata, logos, and JSON schema.

Creation of the two new public repositories is currently blocked by the GitHub connection's permissions. Their sources are temporarily on separate [`codex/launcher-components`](https://github.com/solimaniac/launcher-at/tree/codex/launcher-components) and [`codex/launcher-pds-dir`](https://github.com/solimaniac/launcher-at/tree/codex/launcher-pds-dir) branches. The example installs pinned commits from those branches. They are independent repository roots and are not combined into the website branch.

Both packages are prepared for later publication; neither has been published to npm.
