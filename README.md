# launcher-components

AT Protocol login and onboarding components. The current TypeScript implementation, under `implementations/typescript/`, provides unstyled components for plain JavaScript, React, Vue, Svelte, and other browser apps. Includes a headless flow, accessible DOM components, and an optional official OAuth SDK adapter.

```sh
npm install launcher-components launcher-pds-dir @atproto/oauth-client-browser
```

```ts
import { createLoginFlow } from 'launcher-components'
import { mountLogin } from 'launcher-components/dom'
import { createBrowserOAuthAdapter } from 'launcher-components/oauth'
import { selectProviders } from 'launcher-pds-dir'

const flow = createLoginFlow({
  providers: selectProviders({ ids: ['eurosky', 'blacksky'] }),
  auth: createBrowserOAuthAdapter(oauthClient), // Your BrowserOAuthClient
  onSuccess: result => {
    /* Use result.session in your app. */
  },
})
const unmount = mountLogin(container, flow, { appName: 'Your app' })
// On teardown: unmount(); flow.destroy()
```

No CSS loads automatically. Components use light DOM, inherited fonts, and stable `data-part` attributes. Optional structural CSS: `launcher-components/styles.css`. Use `openLoginDialog` for a modal or `presentation: 'fullscreen'` for a full-page layout.

See [integration](docs/integration.md), [API](docs/api.md), and [onboarding research](docs/onboarding-research.md). Development: `npm ci && npm run check`; `npm run dev` opens the examples. Publish later with `npm publish --access public`; npmx.dev browses npm. Nothing publishes automatically.
