# Integration

The repository keeps each programming-language implementation under `implementations/`. The TypeScript package builds from `implementations/typescript/`; existing npm entrypoints and commands remain unchanged.

## Pick the layers you need

- `launcher-components`: headless state and validation, no browser globals at import time.
- `launcher-components/dom`: ready-to-mount light DOM and a standalone provider picker.
- `launcher-components/oauth`: optional adapter for `@atproto/oauth-client-browser`.
- `launcher-pds-dir`: optional directory of hosts; custom arrays with the same structural fields work too.

Vanilla TypeScript keeps the current launcher's DOM implementation small and makes it usable without adopting a framework. There is no Shadow DOM or custom-element registration, so app CSS, server rendering, and framework lifecycles remain predictable. A framework can also render its own UI from `flow.getState()` and `flow.subscribe()`.

## Browser OAuth

The app owns its OAuth client metadata and SDK instance. Publish your metadata at a public HTTPS URL; its scopes, callback URLs, and grant types must match your client. `BrowserOAuthClient` also supports the AT Protocol loopback development client. See the [official SDK](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-browser) and [OAuth specification](https://atproto.com/specs/oauth).

```ts
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { createBrowserOAuthAdapter } from 'launcher-components/oauth'

const client = await BrowserOAuthClient.load({
  clientId: 'https://your-app.example/oauth-client-metadata.json',
  handleResolver: 'https://bsky.social',
  responseMode: 'fragment',
})
const auth = createBrowserOAuthAdapter(client, {
  scope: 'atproto', // Add the permissions your app actually needs, also in metadata.
  responseMode: 'fragment',
  session: 'retain',
})
```

`atproto` alone proves account authorization; it does not grant app data access. The adapter delegates PKCE, PAR, DPoP, issuer checks, and session storage to the SDK. Never collect the user's password in the app. The adapter's response mode must match the client's; the default is `fragment` for both the examples and the original launcher.

On the callback page, create the flow and call `await flow.finish()`. The adapter captures and removes authorization parameters before asynchronous initialization. You can supply captured `URLSearchParams` to `flow.finish(params)` if your router owns URL cleanup. Handle route detection in your app; do not infer successful login from a query string.

For signup brokers, explicitly set `session: 'discard'`. Cleanup runs before public handle lookup, and the result contains no session or DID. Check `cleanupFailed` and tell users if access revocation could not be confirmed. A broker signup does not sign the user into the app they return to.

For OAuth in a separate browser window, use `transport: 'popup'`. The official SDK manages that window and callback communication; do not build a token-passing `postMessage` bridge. A blocked or dismissed popup is a recoverable error. Use redirect transport where popup support is unsuitable. Your callback page can call `flow.finish()` with the adapter; when the SDK hands control to the opener and closes that window, the callback remains pending without displaying a failure. Initialize the client before the click where possible to preserve browser popup activation. Dialog presentation and OAuth popup transport are independent choices.

If you use a backend OAuth client, provide an `AuthAdapter` with `start(request)` and, if needed, `finish(params)`. Validate issuer, state, permissions, redirect targets, and server-side destinations in that backend; client-side validation is only a UI boundary. Do not expose backend session secrets in a frontend result.

## Full page, inline, or dialog

```ts
const unmount = mountLogin(container, flow, {
  appName: 'Your app',
  presentation: 'fullscreen', // Or 'inline' (default).
  headingLevel: 1,
})

// Or:
const modal = openLoginDialog(flow, { appName: 'Your app' })
// modal.close() / modal.destroy()
```

`openLoginDialog` uses native `<dialog>` for Escape, focus containment, and an inert background. It restores opener focus on close. You still own the flow: call `flow.destroy()` when it is no longer needed. Closing a dialog does not revoke an existing authorization. A custom dialog can mount the inline renderer in its own accessible modal surface.

## Styling and language

No global reset, font, colors, branding, title change, or stylesheet is injected. Set any design system on the containing app. `styles.css` is an optional zero-specificity structural sheet; it inherits typography and foreground color. It adds layout, visible focus, and 44px controls. Keep those accessibility properties when replacing it.

Stable hooks include `[data-launcher]`, `[data-view]`, and selectors such as `[data-part="provider"]`. Available parts are `heading`, `identifier`, `submit`, `button`, `auth-status`, `provider-picker`, `provider`, `provider-details`, `region`, `provider-description`, and `dialog`. Existing launcher class names remain available for migrating its styles. Use `onScreen(root, view)` to add app branding and `renderComplete(root, result)` to render app-specific success actions. The default completion screen does not serialize any auth result.

Pass `t(key, values)` for your translation system, or use `translate({ ...english, 'signin.submit': 'Continue' })`. All strings use text nodes, including provider descriptions and supplied app names. Provider descriptions from the directory are English plain text; apps may map them by stable provider ID for other languages. Text is never interpreted as HTML.

## Choose hosts

```ts
import { providers } from 'launcher-pds-dir'
const flow = createLoginFlow({
  providers,
  providerAllowlist: ['eurosky', 'blacksky'],
  mode: 'both', // Or 'signin' / 'signup'.
  auth,
})
```

An omitted allowlist means all enabled hosts; an empty list means no signup hosts; unknown IDs fail configuration. Disabled hosts cannot be re-enabled by the allowlist. Signup methods also enforce the list, even when called directly. This is a signup directory policy: signing in with an existing handle still discovers that account's current host. Enforce any account-host restriction after verified identity resolution in your OAuth client/backend.

Custom signup hosts require `allowCustomService: true`, and cannot be combined with an allowlist. A custom host must support AT Protocol OAuth and account creation; the UI cannot guarantee those capabilities. Hosted account creation, email verification, invite codes, and acceptance of a host's terms stay on the host's own page.

Copy `node_modules/launcher-pds-dir/logos/` to your app's public assets if you want logos, then provide `logoUrl: provider => provider.logo ? '/your-assets/' + provider.logo : undefined` to the renderer. Nothing fetches a remote directory or contacts every host when the component mounts. Keep directory updates explicit through your dependency lockfile.

## Framework lifecycle

React can mount into an empty ref; Vue uses `onMounted`/`onUnmounted`, and Svelte uses `onMount` returning the teardown. Do not render framework children inside the same DOM root.

```tsx
function Login({ auth, providers }) {
  const root = useRef(null)
  useEffect(() => {
    const flow = createLoginFlow({ providers, auth })
    const unmount = mountLogin(root.current, flow, { appName: 'Your app' })
    return () => {
      unmount()
      flow.destroy()
    }
  }, [auth, providers])
  return <div ref={root} />
}
```

For a custom React design, pass `flow.subscribe` and `flow.getState` to `useSyncExternalStore`. Build one flow per login surface; do not share pending operations between unrelated roots. All public entrypoints can be imported during SSR; call DOM and OAuth URL helpers only in the browser.

## Before the first npm release

These repositories can be installed directly from GitHub (`npm install github:solimaniac/launcher-components` and `github:solimaniac/launcher-pds-dir`). Their `prepare` scripts build the distribution. Once released to npm, use normal versioned dependencies. `npm pack --dry-run` checks what will ship without publishing anything.
