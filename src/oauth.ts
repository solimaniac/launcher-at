import {
  BrowserOAuthClient,
  OAuthResolverError,
  OAuthCallbackError,
  type OAuthClientMetadataInput,
} from '@atproto/oauth-client-browser'
import { SignupError, recoverAppId, type SignupOAuth } from './signup'
let client: BrowserOAuthClient | undefined
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
export const oauth: SignupOAuth = {
  async start(serviceUrl, appId) {
    const c = await getClient()
    try {
      await c.signInRedirect(serviceUrl, { scope: 'atproto', prompt: 'create', state: appId })
    } catch (error) {
      throw new SignupError(error instanceof OAuthResolverError ? 'errors.unsupportedProvider' : 'errors.authorization')
    }
  },
  async finish() {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)
    try {
      const c = await getClient()
      const result = await c.initCallback(params)
      const did = result.session.did
      let cleanupFailed = false
      try {
        await result.session.signOut()
      } catch {
        cleanupFailed = true
      }
      return { did, appId: recoverAppId(result.state), cleanupFailed }
    } catch (error) {
      throw new SignupError(
        error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied'
          ? 'errors.cancelled'
          : error instanceof SignupError
            ? error.key
            : 'errors.callback',
        error instanceof OAuthCallbackError ? recoverAppId(error.state) : null,
      )
    } finally {
      history.replaceState(null, '', location.pathname)
    }
  },
}
