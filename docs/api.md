# API

`createLoginFlow<Result>({ providers, auth, mode?, providerAllowlist?, allowCustomService?, onSuccess? })` returns a store and actions. `mode` defaults to `both`; the initial view is `signin`, or `intro` for signup-only surfaces.

| Member                                              | Behavior                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `getState()`                                        | Immutable `{ view, busy, identifier, error?, result? }` snapshot.                 |
| `subscribe(listener)`                               | Subscribe to changes; returns an unsubscribe function. Does not call immediately. |
| `showSignIn()` / `showSignup()` / `showProviders()` | Navigate within the configured mode. Busy operations prevent navigation.          |
| `signIn(identifier)`                                | Validate a full handle/DID and ask the adapter to sign in.                        |
| `signUp(providerId)`                                | Start hosted signup using an enabled, allowed host.                               |
| `signUpCustom(service)`                             | Start custom hosted signup when explicitly enabled.                               |
| `finish(params?)`                                   | Finish an OAuth callback using the adapter.                                       |
| `back()` / `retry()`                                | Navigate back or recover the prior screen after failure.                          |
| `destroy()`                                         | Abort the pending request and detach subscribers. Late results are ignored.       |

An `AuthAdapter<Result>` implements `start({ intent, input, provider?, signal })` and optionally `finish(params?)`. `start()` may return no result for a redirect, in which case the flow stays busy until navigation. A popup callback may also return no result after the SDK hands control to its opener. Only a returned result produces a success screen. `Result` must not be `undefined`.

`mountLogin(root, flow, options?)` returns `unmount()`. Options: `appName`, `t`, `headingLevel`, `presentation`, `idPrefix`, `logoUrl`, `onScreen`, and `renderComplete`. Unmounting removes the rendered children and subscriptions; it does not destroy a flow owned by the caller.

`renderProviderPicker(document, { providers, onSelect, t?, state?, idPrefix?, logoUrl? })` returns `{ element, setBusy }`. Use `createProviderPickerState()` to retain filters between mounts. Each instance gets independent IDs unless you explicitly supply an `idPrefix`.

`openLoginDialog(flow, options?)` accepts the mount options plus `document` and `onClose`, and returns `{ dialog, close(), destroy() }`. It uses native `<dialog>`; modern browser support is required.

`createBrowserOAuthAdapter(clientOrAsyncFactory, options?)` returns an `AuthAdapter<BrowserAuthResult>`. Options: `scope` (default `atproto`), `transport` (`redirect` by default), `session` (`retain` by default), `responseMode` (`fragment` by default), `state`, and `recoverState`. Result: `{ handle, state, cleanupFailed, session? }`. `session: 'discard'` omits the session entirely. `handle` may be null when public identity resolution fails.

`LauncherError` exposes `key` (a public translation key) and `state` (validated application context). Raw library exceptions are replaced with public error keys. `consumeOAuthResponse(mode?)` captures response parameters and removes them from browser history. The SDK remains responsible for protocol verification.
