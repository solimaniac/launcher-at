import { expect, test, vi } from 'vitest'
import { createLoginFlow, LauncherError, normalizeIdentifier, normalizeService, type AuthRequest } from '../src/index'
import { providers } from './fixtures'

test('signup choices enforce enabled state, strict allowlists, and no custom bypass', async () => {
  const start = vi.fn(async () => {})
  const flow = createLoginFlow({ providers, providerAllowlist: ['alpha', 'disabled'], auth: { start } })
  expect(flow.providers.map(p => p.id)).toEqual(['alpha'])
  await flow.signUp('beta')
  expect(start).not.toHaveBeenCalled()
  await flow.signUp('alpha')
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ input: 'https://alpha.test', intent: 'signup' }))
  expect(createLoginFlow({ providers, providerAllowlist: [], auth: { start } }).providers).toEqual([])
  expect(() => createLoginFlow({ providers, providerAllowlist: ['typo'], auth: { start } })).toThrow('Unknown provider')
  expect(() =>
    createLoginFlow({ providers, providerAllowlist: ['alpha'], allowCustomService: true, auth: { start } }),
  ).toThrow('cannot bypass')
})

test('accepts complete handles and DIDs without forcing a Bluesky host', () => {
  expect(normalizeIdentifier(' @Alice.Personal.Domain ')).toBe('alice.personal.domain')
  expect(normalizeIdentifier('did:plc:ewvi7nxzyoun6zhxrhs64oiz')).toMatch(/^did:plc:/)
  expect(normalizeIdentifier('did:web:identity.example:user')).toMatch(/^did:web:/)
  for (const value of [
    'alice',
    'alice@email.com',
    'https://bsky.app/profile/alice',
    '<script>',
    'alice.123',
    '-bad.test',
  ])
    expect(() => normalizeIdentifier(value)).toThrow(LauncherError)
  for (const value of [
    'javascript:alert(1)',
    'http://pds.example',
    'https://me:secret@pds.example',
    'https://pds.example/#token',
  ])
    expect(() => normalizeService(value)).toThrow()
})

test('preserves failed input, sanitizes library errors, and retries the same screen', async () => {
  const start = vi.fn(async () => {
    throw new Error('secret code and raw response')
  })
  const flow = createLoginFlow({ providers, auth: { start } })
  await flow.signIn('alice')
  expect(flow.getState()).toMatchObject({ view: 'signin', identifier: 'alice', error: 'errors.identifier' })
  expect(start).not.toHaveBeenCalled()
  await flow.signIn('@alice.example')
  expect(flow.getState()).toMatchObject({
    view: 'error',
    identifier: 'alice.example',
    error: 'errors.authorization',
    busy: false,
  })
  flow.retry()
  expect(flow.getState()).toMatchObject({ view: 'signin', identifier: 'alice.example', error: undefined })
})

test('deduplicates pending requests and ignores completion after teardown', async () => {
  let resolve!: (result: string) => void
  let signal!: AbortSignal
  const onSuccess = vi.fn()
  const start = vi.fn((request: AuthRequest) => {
    signal = request.signal
    return new Promise<string>(r => {
      resolve = r
    })
  })
  const flow = createLoginFlow({ providers, auth: { start }, onSuccess })
  const pending = flow.signIn('alice.example')
  await flow.signIn('alice.example')
  expect(start).toHaveBeenCalledTimes(1)
  flow.destroy()
  expect(signal.aborted).toBe(true)
  resolve('authenticated')
  await pending
  expect(onSuccess).not.toHaveBeenCalled()
})

test('redirects remain pending; popup and callback results complete exactly once', async () => {
  const redirect = createLoginFlow({ providers, auth: { start: async () => {} } })
  await redirect.signIn('alice.example')
  expect(redirect.getState()).toMatchObject({ view: 'signin', busy: true })
  expect(redirect.getState().result).toBeUndefined()
  const onSuccess = vi.fn()
  const popup = createLoginFlow({ providers, auth: { start: async () => 'session' }, onSuccess })
  await popup.signIn('alice.example')
  expect(popup.getState()).toMatchObject({ view: 'complete', result: 'session', busy: false })
  expect(onSuccess).toHaveBeenCalledOnce()
  const callback = createLoginFlow({ providers, auth: { start: async () => {}, finish: async () => 'callback' } })
  await callback.finish(new URLSearchParams('code=example'))
  expect(callback.getState().result).toBe('callback')
})

test('signup-only and signin-only configurations do not expose the other operation', async () => {
  const start = vi.fn(async () => {})
  const signup = createLoginFlow({ providers, mode: 'signup', auth: { start } })
  signup.showSignIn()
  await signup.signIn('alice.example')
  expect(signup.getState().view).toBe('intro')
  const signin = createLoginFlow({ providers, mode: 'signin', auth: { start } })
  signin.showSignup()
  signin.showProviders()
  await signin.signUp('alpha')
  expect(signin.getState().view).toBe('signin')
  expect(start).not.toHaveBeenCalled()
})
