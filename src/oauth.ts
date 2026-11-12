import { BrowserOAuthClient, type OAuthClientMetadataInput } from '@atproto/oauth-client-browser'
import { LauncherError } from '@apogeekit/launcher-components'
import { createBrowserOAuthAdapter } from '@apogeekit/launcher-components/oauth'
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

/** A signup broker: the reusable adapter revokes its session before resolving a handle. */
export const oauth: SignupOAuth = {
  async start(serviceUrl, appId) {
    const adapter = createBrowserOAuthAdapter(getClient, {
      state: appId,
      recoverState: recoverAppId,
      session: 'discard',
    })
    try {
      await adapter.start({ intent: 'signup', input: serviceUrl, signal: new AbortController().signal })
    } catch (error) {
      throw new SignupError(error instanceof LauncherError ? error.key : 'errors.authorization')
    }
  },
  async finish() {
    const adapter = createBrowserOAuthAdapter(getClient, {
      recoverState: recoverAppId,
      session: 'discard',
      responseMode: 'fragment',
    })
    try {
      const result = await adapter.finish!()
      if (!result) throw new SignupError('errors.callback')
      return { handle: result.handle, appId: result.state, cleanupFailed: result.cleanupFailed }
    } catch (error) {
      throw new SignupError(
        error instanceof LauncherError ? error.key : 'errors.callback',
        error instanceof LauncherError ? error.state : null,
      )
    }
  },
}
