import {
  OAuthCallbackError,
  OAuthResolverError,
  LoginContinuedInParentWindowError,
  type BrowserOAuthClient,
  type OAuthSession,
} from '@atproto/oauth-client-browser'
import { LauncherError, type AuthAdapter } from './types'

export interface BrowserAuthResult {
  readonly handle: string | null
  readonly state: string | null
  readonly cleanupFailed: boolean
  /** Present only with session: 'retain'. This SDK session belongs to the consuming app. */
  readonly session?: OAuthSession
}

export interface BrowserAuthOptions {
  /** Declare the same scopes in your public OAuth client metadata. */
  scope?: string
  transport?: 'redirect' | 'popup'
  /** App login retains the SDK session. Signup brokers should explicitly discard it. */
  session?: 'retain' | 'discard'
  responseMode?: 'query' | 'fragment'
  /** Opaque application context; never a return URL. SDK manages CSRF state separately. */
  state?: string
  /** Validate recovered context against your app configuration. */
  recoverState?: (value: unknown) => string | null
}

const HANDLE_TIMEOUT_MS = 3000
const AUTH_PARAMS = ['code', 'state', 'iss', 'error', 'error_description', 'error_uri']

/** Capture and remove the OAuth response before any asynchronous initialization. */
export function consumeOAuthResponse(mode: 'query' | 'fragment' = 'fragment'): URLSearchParams {
  const url = new URL(location.href)
  const params = new URLSearchParams(mode === 'fragment' ? url.hash.slice(1) : url.search)
  if (mode === 'fragment') url.hash = ''
  else for (const key of AUTH_PARAMS) url.searchParams.delete(key)
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return params
}

/** Delegates PKCE, PAR, DPoP, identity/issuer verification and sessions to the official SDK. */
export function createBrowserOAuthAdapter(
  source: BrowserOAuthClient | (() => Promise<BrowserOAuthClient>),
  options: BrowserAuthOptions = {},
): AuthAdapter<BrowserAuthResult> {
  const getClient = () => (typeof source === 'function' ? source() : Promise.resolve(source))
  const recover = (value: unknown) =>
    options.recoverState ? options.recoverState(value) : typeof value === 'string' ? value : null
  async function result(client: BrowserOAuthClient, session: OAuthSession, state: unknown): Promise<BrowserAuthResult> {
    let cleanupFailed = false
    if (options.session === 'discard') {
      try {
        await session.signOut()
      } catch {
        cleanupFailed = true
      }
    }
    let handle: string | null = null
    try {
      const identity = await client.identityResolver.resolve(session.did, {
        signal: AbortSignal.timeout(HANDLE_TIMEOUT_MS),
        noCache: true,
      })
      if (identity.did === session.did && identity.handle !== 'handle.invalid') handle = identity.handle
    } catch {
      /* A handle lookup failure does not undo successful authorization. */
    }
    return { handle, state: recover(state), cleanupFailed, ...(options.session === 'discard' ? {} : { session }) }
  }
  function fail(error: unknown, callback = false): never {
    if (error instanceof LauncherError) throw error
    const state = error instanceof OAuthCallbackError ? recover(error.state) : null
    if (error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied')
      throw new LauncherError('errors.cancelled', state)
    if (error instanceof Error && error.name === 'AbortError') throw new LauncherError('errors.cancelled', state)
    throw new LauncherError(
      error instanceof OAuthResolverError
        ? 'errors.unsupportedProvider'
        : callback
          ? 'errors.callback'
          : 'errors.authorization',
      state,
    )
  }
  return {
    async start(request) {
      let client: BrowserOAuthClient
      try {
        client = await getClient()
      } catch {
        throw new LauncherError('errors.initialization')
      }
      const authOptions = {
        scope: options.scope ?? 'atproto',
        signal: request.signal,
        ...(request.intent === 'signup' ? { prompt: 'create' as const } : {}),
      }
      try {
        if (options.transport === 'popup') {
          const session = await client.signInPopup(request.input, authOptions)
          return await result(client, session, options.state)
        }
        await client.signInRedirect(request.input, { ...authOptions, state: options.state })
      } catch (error) {
        fail(error)
      }
    },
    async finish(params) {
      const captured = params ?? consumeOAuthResponse(options.responseMode ?? 'fragment')
      try {
        const client = await getClient()
        const response = await client.initCallback(captured)
        return await result(client, response.session, response.state)
      } catch (error) {
        // The official SDK already notified the opener and attempted to close this window.
        if (error instanceof LoginContinuedInParentWindowError) return
        fail(error, true)
      }
    },
  }
}
