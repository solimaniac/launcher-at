import { BrowserOAuthClient, OAuthResolverError, OAuthCallbackError, type OAuthClientMetadataInput } from '@atproto/oauth-client-browser'
import { validId } from './config'
export interface SignupResult { did: string; appId: string | null; cleanupFailed: boolean }
export interface SignupOAuth { start(serviceUrl: string, appId: string): Promise<void>; finish(): Promise<SignupResult> }
export class SignupError extends Error {
  readonly key: string
  constructor(key: string) { super(key); this.key = key }
}
export function recoverAppId(state: unknown): string | null { return validId(state) ? state : null }
let client: BrowserOAuthClient | undefined
async function getClient() {
  if (client) return client
  try {
    const response = await fetch('/oauth-client-metadata.json')
    if (!response.ok) throw new Error('Metadata unavailable')
    const metadata = await response.json() as OAuthClientMetadataInput
    client = new BrowserOAuthClient({ clientMetadata: metadata, handleResolver: 'https://bsky.social', responseMode: 'fragment' })
    return client
  } catch { throw new SignupError('errors.initialization') }
}
export const oauth: SignupOAuth = {
  async start(serviceUrl, appId) {
    const c = await getClient()
    try { await c.signInRedirect(serviceUrl, { scope: 'atproto', prompt: 'create', state: appId }) }
    catch (error) { throw new SignupError(error instanceof OAuthResolverError ? 'errors.unsupportedProvider' : 'errors.authorization') }
  },
  async finish() {
    const c = await getClient()
    try {
      const result = await c.initCallback()
      const did = result.session.did
      let cleanupFailed = false
      try { await result.session.signOut() } catch { cleanupFailed = true }
      return { did, appId: recoverAppId(result.state), cleanupFailed }
    } catch (error) {
      throw new SignupError(error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied' ? 'errors.cancelled' : 'errors.callback')
    } finally { history.replaceState(null, '', location.pathname) }
  },
}
