// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser'
import { LoginContinuedInParentWindowError } from '@atproto/oauth-client-browser'
import { consumeOAuthResponse, createBrowserOAuthAdapter } from '../src/oauth'
import { LauncherError, type AuthRequest } from '../src/index'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const request = (intent: 'signin' | 'signup' = 'signup'): AuthRequest => ({
  intent,
  input: intent === 'signup' ? 'https://pds.example' : 'alice.example',
  signal: new AbortController().signal,
})
function clientFixture(options: { wrongDid?: boolean; cleanupFailure?: boolean } = {}) {
  const session = {
    did,
    signOut: vi.fn(async () => {
      if (options.cleanupFailure) throw new Error('private cleanup failure')
    }),
  } as unknown as OAuthSession
  const client = {
    identityResolver: {
      resolve: vi.fn(async () => ({ did: options.wrongDid ? 'did:plc:another' : did, handle: 'alice.example' })),
    },
    initCallback: vi.fn(async () => ({ session, state: 'app-id' })),
    signInRedirect: vi.fn(async (..._args: unknown[]) => {}),
    signInPopup: vi.fn(async (..._args: unknown[]) => session),
  }
  return { client, session, sdk: client as unknown as BrowserOAuthClient }
}
afterEach(() => history.replaceState(null, '', '/'))

test('discard mode revokes credentials before identity lookup and never returns a DID or session', async () => {
  const { client, session, sdk } = clientFixture()
  client.identityResolver.resolve.mockImplementation(async () => {
    expect(session.signOut).toHaveBeenCalledOnce()
    return { did, handle: 'alice.example' }
  })
  history.replaceState(null, '', '/callback.html#code=private&state=secret')
  const adapter = createBrowserOAuthAdapter(
    async () => {
      expect(location.hash).toBe('')
      return sdk
    },
    { session: 'discard', recoverState: value => (value === 'app-id' ? value : null) },
  )
  const result = await adapter.finish!()
  expect(result).toEqual({ handle: 'alice.example', state: 'app-id', cleanupFailed: false })
  expect(result).not.toHaveProperty('did')
  expect(result).not.toHaveProperty('session')
})

test('handle mismatch and cleanup failure preserve success without a misleading handle', async () => {
  const { sdk } = clientFixture({ wrongDid: true, cleanupFailure: true })
  const result = await createBrowserOAuthAdapter(sdk, { session: 'discard', recoverState: () => null }).finish!(
    new URLSearchParams(),
  )
  expect(result).toEqual({ handle: null, state: null, cleanupFailed: true })
})

test('signup asks for account creation; signin leaves account selection to the provider', async () => {
  const { client, sdk } = clientFixture()
  const adapter = createBrowserOAuthAdapter(sdk, { state: 'my-app' })
  await adapter.start(request())
  expect(client.signInRedirect).toHaveBeenCalledWith(
    'https://pds.example',
    expect.objectContaining({ prompt: 'create', scope: 'atproto', state: 'my-app' }),
  )
  await adapter.start(request('signin'))
  expect(client.signInRedirect.mock.calls[1]![1]).not.toHaveProperty('prompt')
})

test('popup transport delegates to the official SDK and retains the app session by default', async () => {
  const { client, session, sdk } = clientFixture()
  const result = await createBrowserOAuthAdapter(sdk, {
    transport: 'popup',
    scope: 'atproto transition:generic',
  }).start(request('signin'))
  expect(client.signInPopup).toHaveBeenCalledWith(
    'alice.example',
    expect.objectContaining({ scope: 'atproto transition:generic' }),
  )
  expect(result).toMatchObject({ handle: 'alice.example', session })
  expect(session.signOut).not.toHaveBeenCalled()
})

test('callback errors are public keys and query cleanup preserves unrelated app context', async () => {
  history.replaceState(null, '', '/callback?code=private&state=secret&theme=dark#section')
  const params = consumeOAuthResponse('query')
  expect(params.get('code')).toBe('private')
  expect(location.search).toBe('?theme=dark')
  expect(location.hash).toBe('#section')
  const { client, sdk } = clientFixture()
  client.initCallback.mockRejectedValue(new Error('private response'))
  await expect(createBrowserOAuthAdapter(sdk).finish!(params)).rejects.toMatchObject({ key: 'errors.callback' })
  expect(new LauncherError('errors.cancelled').message).toBe('errors.cancelled')
})

test('the SDK popup handoff is not rendered as a failed login in the callback window', async () => {
  const { client, sdk } = clientFixture()
  client.initCallback.mockRejectedValue(new LoginContinuedInParentWindowError())
  await expect(createBrowserOAuthAdapter(sdk).finish!(new URLSearchParams())).resolves.toBeUndefined()
})
