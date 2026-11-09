# launcher-pds-dir

AT Protocol account hosts and entryways, extracted from [launcher.at](https://github.com/solimaniac/launcher-at). Includes descriptions, regions, invite information, and logos.

```sh
npm install launcher-pds-dir
```

```ts
import { selectProviders } from 'launcher-pds-dir'

const providers = selectProviders({ ids: ['eurosky', 'blacksky'] })
// Pass providers directly to launcher-components.
```

The same snapshot is available as `launcher-pds-dir/providers.json`, with a JSON schema at `launcher-pds-dir/schema.json`. Copy `logos/` into your app's public assets if needed. Names and logos belong to their owners.

Metadata is a curated snapshot, not a live availability guarantee. Missing `requiresInvite` means unknown. Source information is in `data/provenance.json`.

Development: `npm ci && npm run check`. To publish later: `npm publish --access public`; npmx.dev browses the npm registry. Nothing is published automatically.
