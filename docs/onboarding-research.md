# Atmosphere onboarding research

Observed 9 November 2026. This is a design record for the components, separate from their short README. Reference apps change; the observations below describe the inspected screens and source, not a claim about every version.

## Sources and method

- Walked the public landing, sign-in, help, signup, and expanded host-picker screens of [Anisota](https://anisota.net/login) and [Margin](https://margin.at/login) in Chromium. No account was created, no password entered, and no authorization approved.
- Read Margin's [login component](https://tangled.org/margin.at/margin/blob/main/web/src/views/auth/Login.tsx), [signup modal](https://tangled.org/margin.at/margin/blob/main/web/src/components/modals/SignUpModal.tsx), and [OAuth handler](https://tangled.org/margin.at/margin/blob/main/backend/internal/oauth/handler.go), at commit `62853150e5d14bfe5ba3a0cf94ba2d5cceef1c5a`. Compared the implementation with the live UI.
- Read Anisota's publicly served application bundle to confirm its sign-in, account-host selection, and identity-confirmation states. Source access was limited to that deployed bundle; no public source repository was assumed.
- Compared the [Leaflet landing page](https://leaflet.pub) and [Tangled landing page](https://tangled.org), which show different app benefits while describing shared identity. These were contextual comparisons, not complete authenticated walkthroughs.
- Checked the [AT Protocol overview](https://atproto.com/guides/overview), [OAuth specification](https://atproto.com/specs/oauth), and the [official browser OAuth SDK](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-browser) against the proposed architecture.
- Applied [taste-skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md), particularly its `copy.md`, `copy-voice.md`, and `system.md` guidance: explain the mechanism, use concrete nouns and actions, disclose limits, label fields, keep errors beside them, and confirm only after a real result. Its marketing-site font/palette and hero recipes are outside this package's scope: consuming apps own their designs.

## What the reference flows do

| Concern         | Anisota                                                                                                                                                                          | Margin                                                                                              | Component decision                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing users  | A handle field leads the login screen and names both Bluesky and Atmosphere accounts.                                                                                            | A handle field is the primary action; recognizable host names rotate in its heading.                | Start with a visible, stable handle label. Explain that a Bluesky account already works; do not require choosing a host for an existing account.                           |
| New users       | A separate account-making path explains where the account lives before showing hosts.                                                                                            | Account creation opens a modal; its own host comes first, with other options behind another action. | Keep signup separate from sign-in. Explain the host's role at the choice, and make supported hosts an explicit app configuration.                                          |
| Leaving the app | The signup screen says that account creation happens on the host's page and the user returns.                                                                                    | The signup modal selects a host, then the backend starts hosted OAuth.                              | Say where the next action goes before starting it. Account forms stay with the host.                                                                                       |
| Authorization   | Optional help illustrates the user/host/app relationship and describes the app's actual access. Its sign-in state machine also contains identity confirmation before continuing. | Login sends the handle to the backend and follows an authorization URL.                             | Provide optional, plain-language help. Let the SDK discover the host and handle authorization; custom clients can add identity confirmation using the headless layer.      |
| Host choice     | A short list shows recognizable host names, domains, and regions.                                                                                                                | More options expose additional hosts, invitation badges, and a custom-PDS path.                     | Show names, plain descriptions, region, and known invite requirements; provide filters for larger lists. Custom hosts are opt-in and cannot bypass a configured allowlist. |
| Brand/layout    | A full-screen composition around its own product identity.                                                                                                                       | A full-page sign-in card plus a signup modal.                                                       | One flow with replaceable presentation: inline, full page, native dialog, or a custom headless renderer.                                                                   |

Margin checks `describeServer` to update invite information and sorts its own host first. This package deliberately imports a curated snapshot without contacting every host at mount time. That avoids treating a failed request as evidence that signup is open, avoids unnecessary network disclosure, and gives clients control over freshness. It does not label hosts as recommended or promise their policies.

The two apps' reusable lesson is their mechanism and information order. Their wording, visual identities, illustrations, and animation are not copied.

## The explanation

The default language answers the questions needed for the next decision:

1. **Can I use my account?** If you use Bluesky or another compatible Atmosphere app, try that account's handle.
2. **What is the Atmosphere?** A network of apps that can work with the same account; Bluesky is a familiar example.
3. **Where do I create an account?** Choose an account host. It stores account data and runs its own signup page.
4. **Why am I leaving the app?** The host handles sign-in and the app asks for access there. The user reviews the authorization.
5. **What happens next?** A real SDK/backend result completes login. A signup broker explains that the destination app may still ask the user to sign in.

Voice card: plain explanatory product language; second person for user actions; consistent nouns `account`, `handle`, `host`, and `app`; short form errors; no humor, slogans, ownership absolutes, or unsupported compatibility claims.

“Personal Data Server” and “PDS” belong in advanced settings and developer documentation. The novice path uses “account host.” Technical details are available without becoming prerequisites to entering a handle.

Avoid claiming all apps can access all data: lexicon support and permissions differ. Avoid promising that changing hosts is always easy or that everything is private. AT Protocol supports account portability, while migration tooling and app support vary. Region information is descriptive and does not itself guarantee residency or jurisdiction. An invite requirement absent from the snapshot is unknown.

## Flow and implementation implications

```text
Existing account → handle/DID → host authorization → app result
New account → short explanation → supported host → hosted signup/authorization → result
                                                        ↓
                                               cancellation/failure → retry
```

The default combined flow begins at sign-in. A signup-only broker can begin at the explanation. Consumers can render the same state in their own layout; page presentation does not decide whether OAuth uses a redirect or popup.

Authentication is an adapter boundary. A browser app can use the official SDK; a server app can supply its own backend integration. The UI never implements password entry, DPoP, PKCE, PAR, account creation, or client metadata hosting. Those are protocol/client/host responsibilities.

No automatic return URL comes from a query string or OAuth context. Apps own navigation after verified completion. Recovered state is application context, and can be validated with `recoverState`. The original launcher keeps its configured destinations and discards its short-lived broker session.

## Validation targets

Keyboard focus moves to the heading on each new screen and to an invalid field on submit. Filter controls retain choices after failure. All controls have visible labels or accessible names. Each mount uses unique IDs. Provider names and translated copy remain text, never HTML. Busy requests cannot be double-submitted, and teardown suppresses late completions.

Browser review covers inline, full-page, and dialog surfaces, default/light/dark consumer styling, 320px and 390px widths, Escape and focus return, reduced motion, and failures. Package checks cover ESM/CommonJS imports, TypeScript declarations, SSR-safe imports, and the actual npm tarball contents. No test signs up a real account or approves a real authorization.
