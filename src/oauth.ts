import {
  BrowserOAuthClient,
  OAuthResolverError,
  OAuthCallbackError,
  type OAuthClientMetadataInput,
} from '@atproto/oauth-client-browser'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'

let client: BrowserOAuthClient | undefined
const HANDLE_LOOKUP_TIMEOUT_MS = 3000

/** Lazily creates the OAuth client from the metadata generated at build time. */
async function getClient() {
  if (client) return client
  try {
    const response = await fetch('/oauth-client-metadata.json')
    if (!response.ok) throw new Error('Metadata unavailable')
    const metadata = (await response.json()) as OAuthClientMetadataInput
    client = new BrowserOAuthClient({
      clientMetadata: metadata,
      handleResolver: 'https://bsky.social',
      responseMode: 'fragment',
    })
    return client
  } catch {
    throw new SignupError('errors.initialization')
  }
}

/** Maps a callback failure to the locale key shown to the user. */
function callbackErrorKey(error: unknown) {
  if (error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied') return 'errors.cancelled'
  if (error instanceof SignupError) return error.key
  return 'errors.callback'
}

export const oauth: SignupOAuth = {
  async start(serviceUrl, appId) {
    const client = await getClient()
    try {
      // `prompt: 'create'` asks the provider for its account-creation screen; `state` carries only the app ID.
      await client.signInRedirect(serviceUrl, { scope: 'atproto', prompt: 'create', state: appId })
    } catch (error) {
      throw new SignupError(error instanceof OAuthResolverError ? 'errors.unsupportedProvider' : 'errors.authorization')
    }
  },

  async finish() {
    const params = new URLSearchParams(location.hash.slice(1))
    // Remove the authorization response from the address bar and history straight away.
    history.replaceState(null, '', location.pathname)
    try {
      const client = await getClient()
      const result = await client.initCallback(params)
      const did = result.session.did
      // The launcher only needs proof of signup, so it discards its own session immediately.
      let cleanupFailed = false
      try {
        await result.session.signOut()
      } catch {
        cleanupFailed = true
      }
      // Public identity resolution needs no session; never delay credential cleanup for it.
      let handle: string | null = null
      try {
        const identity = await client.identityResolver.resolve(did, {
          signal: AbortSignal.timeout(HANDLE_LOOKUP_TIMEOUT_MS),
          noCache: true,
        })
        if (identity.did === did && identity.handle !== 'handle.invalid') handle = identity.handle
      } catch {
        // A missing or temporarily unavailable handle does not undo a successful signup.
      }
      return { handle, appId: recoverAppId(result.state), cleanupFailed }
    } catch (error) {
      const appId = error instanceof OAuthCallbackError ? recoverAppId(error.state) : null
      throw new SignupError(callbackErrorKey(error), appId)
    } finally {
      history.replaceState(null, '', location.pathname)
    }
  },
}
