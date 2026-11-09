# Programming-language implementations

`launcher-components` is a repository for implementations of the same onboarding flow in different programming languages. TypeScript is the current implementation. Dart/Flutter can be added as a native implementation in this repository when needed.

```text
contracts/v1/                 Shared flow vocabulary, rules, and behavior fixtures
copy/en.json                 Shared English copy and interpolation placeholders
implementations/typescript/  Current web source, DOM/OAuth adapters, tests, examples, CSS
docs/                        Research, integration notes, and platform guidance
package.json                 Existing npm distribution and TypeScript build commands
```

A future Flutter package belongs under `implementations/flutter/`, with its own `pubspec.yaml`, Dart sources, widgets, adapters, and tests. There is no Dart package yet. The repository does not require every implementation to use npm or run JavaScript. The existing `launcher-components`, `launcher-components/dom`, `launcher-components/oauth`, and `launcher-components/styles.css` npm entrypoints remain unchanged.

## Shared behavior

[`contracts/v1/flow.json`](../contracts/v1/flow.json) defines the modes, initial views, intents, state vocabulary, public error keys, action meanings, and provider/security rules. TypeScript generates its mode, view, intent, and error-key types from these names. Native implementations use equivalent enums and models. After changing the shared names, run `npm run generate:contracts` and commit the generated TypeScript file; `npm run check` rejects stale declarations. The generator is build tooling, and native applications do not need it at runtime.

The contract specifies observable behavior, not a language-level API or UI tree. A Dart implementation may expose streams or notifiers instead of TypeScript subscriptions; a Flutter widget may use a route, sheet, or native dialog instead of DOM nodes. Preserve enabled-host and allowlist rules, input retention, request deduplication, public errors, verified completion, and teardown behavior.

[`copy/en.json`](../copy/en.json) contains plain UTF-8 strings with stable dotted keys. The TypeScript implementation imports it directly. A future Flutter build can bundle it or convert it to ARB, preserving keys and the `{{appName}}`, `{{name}}`, `{{count}}`, and `{{total}}` placeholders. Other human-language catalogs can be added separately; programming-language support and UI translation are distinct concerns. Apps may override copy and use their own localization system.

## Conformance fixtures

[`contracts/v1/conformance.json`](../contracts/v1/conformance.json) is executable behavior data that every implementation can read without importing TypeScript. Its fictional host fixture is test data, not a second directory of real PDSs.

Each case creates an isolated flow with optional configuration and a simulated auth adapter. Run its ordered steps, then compare the observations in each `expect` step. Omitted expectation fields impose no assertion.

| Fixture field or step                  | Meaning                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `options`                              | `mode`, `providerAllowlist`, and `allowCustomService`; omitted values use the documented defaults.                              |
| `configurationError`                   | Construction must fail before any auth request.                                                                                 |
| `auth.start` / `auth.finish`           | Simulated `success`, `error`, `redirect`, `handoff`, or `deferred` outcome. A success returns an opaque local example result.   |
| `auth.errorKey`                        | A known public error; without one, simulate a private library exception that the flow sanitizes.                                |
| An action name                         | Invoke the equivalent action defined in the flow contract. `input` supplies its argument.                                       |
| `defer: true`                          | Start the operation without awaiting it, so later steps can inspect or interrupt it.                                            |
| `resolve`                              | Resolve outstanding deferred auth results, then wait for the started operations to settle.                                      |
| `expect.state`                         | Match the specified fields. Normalize absent errors to `null` and result presence to `hasResult`. Do not serialize credentials. |
| `expect.requests`                      | Compare normalized `{ intent, input, providerId }` requests; use `null` when no listed host was selected.                       |
| `expect.providerIds`                   | Compare the offered provider IDs in directory order, before a renderer sorts them.                                              |
| `expect.requestCount` / `successCount` | Count adapter starts and verified completion callbacks.                                                                         |
| `expect.signalAborted`                 | Check the last operation's cancellation mechanism; a native cancellation token is equivalent to an AbortSignal.                 |

The TypeScript runner is [`implementations/typescript/test/conformance.test.ts`](../implementations/typescript/test/conformance.test.ts), run by `npm test`. A Flutter runner should read this same JSON, supply fake native auth operations, and execute the same cases in `dart test` or `flutter test`. Its own tests should additionally cover native focus, navigation, themes, accessibility, and OAuth lifecycle behavior. Keep platform adapters mocked in conformance tests.

## Directory and authorization

Every implementation consumes `launcher-pds-dir`'s [`data/providers.json`](https://github.com/solimaniac/launcher-pds-dir/blob/main/data/providers.json) and [`schema.json`](https://github.com/solimaniac/launcher-pds-dir/blob/main/schema.json). npm consumers can import the package; Dart can bundle or fetch a version-pinned JSON snapshot and validate the same fields. A native package does not need the directory's JavaScript helpers. Missing invite information means unknown. Apps decide how to supply logos as platform assets.

OAuth is a platform adapter boundary. The browser adapter uses the official browser SDK. A future Flutter adapter owns its system-browser authorization, redirect/deep-link handling, protocol verification, cancellation, and secure session storage, or delegates these to an app-owned backend. Its result stays local to that app. Do not share credentials across runtimes or require a webview to reuse the flow.

Fonts, theme, widget layout, and presentation belong to the consuming app in every implementation. Shared behavior does not mandate CSS, a font, or a visual design system.

## Adding and releasing an implementation

1. Create its directory and native package manifest under `implementations/`.
2. Implement the current flow contract and consume the shared copy and PDS directory data.
3. Add a native runner for the existing conformance JSON and platform-specific tests.
4. Add its SDK/toolchain CI job. Keep TypeScript checks independent of the new toolchain.
5. Release each language package through its own ecosystem: npm for TypeScript, pub.dev for a future Dart package. Package versions are independent; record which shared contract major version each implementation supports.

Breaking shared behavior or fixture semantics require a new contract directory, such as `contracts/v2/`, so implementations can adopt it deliberately. Additive scenarios should exercise existing v1 rules. npm also ships the shared files at `launcher-components/contracts/v1/flow.json`, `launcher-components/contracts/v1/conformance.json`, and `launcher-components/copy/en.json`; the contracts are ordinary JSON in the repository for non-JavaScript tooling.
