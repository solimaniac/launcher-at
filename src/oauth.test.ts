// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { AtprotoIdentityResolver } from '@atproto-labs/identity-resolver'
import { createDidResolver } from '@atproto-labs/did-resolver'
import type { AtprotoDid } from '@atproto-labs/identity-resolver'
import { oauth } from './oauth'

const fixture = vi.hoisted(() => ({
  did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz' as AtprotoDid,
  signedOut: false,
  cleanupFailed: false,
  resolver: undefined as AtprotoIdentityResolver | undefined,
}))
vi.mock('@atproto/oauth-client-browser', () => ({
  BrowserOAuthClient: class {
    get identityResolver() {
      return fixture.resolver!
    }
    async initCallback() {
      return {
        state: 'example-app',
        session: {
          did: fixture.did,
          signOut: async () => {
            fixture.signedOut = true
            if (fixture.cleanupFailed) throw new Error('Cleanup unavailable')
          },
        },
      }
    }
  },
  OAuthCallbackError: class extends Error {},
  OAuthResolverError: class extends Error {},
}))

const handle = 'alice.bsky.social'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

async function callback(options: { reverseDid?: AtprotoDid; unavailable?: boolean; cleanupFailed?: boolean } = {}) {
  fixture.signedOut = false
  fixture.cleanupFailed = options.cleanupFailed ?? false
  fixture.resolver = new AtprotoIdentityResolver(
    createDidResolver({
      fetch: async () => {
        expect(fixture.signedOut).toBe(true)
        if (options.unavailable) throw new Error('Identity unavailable')
        return new Response(JSON.stringify({ id: fixture.did, alsoKnownAs: [`at://${handle}`] }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    }),
    { resolve: async () => options.reverseDid ?? fixture.did },
  )
  vi.stubGlobal('fetch', async () => new Response('{}'))
  history.replaceState(null, '', '/callback.html#code=private-code&state=private-state')
  return oauth.finish()
}

test('returns a bidirectionally verified handle after credential cleanup and removes the OAuth response', async () => {
  const result = await callback()
  expect(result).toEqual({ handle, appId: 'example-app', cleanupFailed: false })
  expect(location.hash).toBe('')
  expect(result).not.toHaveProperty('did')
})

test('does not display a claimed handle belonging to a different account', async () => {
  expect((await callback({ reverseDid: 'did:plc:other' })).handle).toBeNull()
})

test('identity failure preserves signup success and the configured app context', async () => {
  expect(await callback({ unavailable: true })).toEqual({
    handle: null,
    appId: 'example-app',
    cleanupFailed: false,
  })
})

test('cleanup failure remains visible even when the handle resolves', async () => {
  expect(await callback({ cleanupFailed: true })).toEqual({ handle, appId: 'example-app', cleanupFailed: true })
})
