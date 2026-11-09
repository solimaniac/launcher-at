import { normalizeIdentifier, normalizeService } from './input'
import {
  LauncherError,
  type AccountProvider,
  type AuthAdapter,
  type AuthRequest,
  type LoginState,
  type LoginMode,
  type View,
} from './types'

export interface LoginFlowOptions<Result> {
  providers: readonly AccountProvider[]
  /** Restricts listed signup hosts. Existing handles are discovered by OAuth. */
  providerAllowlist?: readonly string[]
  mode?: LoginMode
  /** Explicit opt-in. Cannot be combined with a provider allowlist. */
  allowCustomService?: boolean
  auth: AuthAdapter<Result>
  onSuccess?: (result: Result) => void
}

export interface LoginFlow<Result> {
  readonly providers: readonly AccountProvider[]
  readonly mode: LoginMode
  readonly allowCustomService: boolean
  getState(): LoginState<Result>
  subscribe(listener: () => void): () => void
  showSignup(): void
  showSignIn(): void
  showProviders(): void
  back(): void
  retry(): void
  signIn(identifier: string): Promise<void>
  signUp(providerId: string): Promise<void>
  signUpCustom(service: string): Promise<void>
  finish(params?: URLSearchParams): Promise<void>
  destroy(): void
}

/** No DOM, routing, global state, storage, or network activity until an action runs. */
export function createLoginFlow<Result>(options: LoginFlowOptions<Result>): LoginFlow<Result> {
  const mode = options.mode ?? 'both'
  if (options.allowCustomService && options.providerAllowlist !== undefined)
    throw new TypeError('Custom signup cannot bypass a provider allowlist')
  const known = new Set<string>()
  for (const p of options.providers) {
    if (
      typeof p.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) ||
      known.has(p.id) ||
      [p.name, p.description, p.region].some(value => typeof value !== 'string' || !value.trim()) ||
      typeof p.enabled !== 'boolean' ||
      (p.requiresInvite !== undefined && typeof p.requiresInvite !== 'boolean')
    )
      throw new TypeError('Invalid or duplicate provider')
    normalizeService(p.serviceUrl)
    known.add(p.id)
  }
  for (const id of options.providerAllowlist ?? []) if (!known.has(id)) throw new TypeError(`Unknown provider: ${id}`)
  const providers = Object.freeze(
    options.providers
      .filter(p => p.enabled && (!options.providerAllowlist || options.providerAllowlist.includes(p.id)))
      .map(p => Object.freeze({ ...p, serviceUrl: normalizeService(p.serviceUrl) })),
  )
  let state: LoginState<Result> = Object.freeze({
    view: mode === 'signup' ? 'intro' : 'signin',
    busy: false,
    identifier: '',
  })
  let previous: View = state.view
  let disposed = false
  let operation = 0
  let active: AbortController | undefined
  const listeners = new Set<() => void>()
  function update(patch: Partial<LoginState<Result>>) {
    if (disposed) return
    state = Object.freeze({ ...state, ...patch })
    for (const listener of listeners) listener()
  }
  function navigate(view: View) {
    if (!disposed && !state.busy) update({ view, error: undefined })
  }
  function failure(error: unknown, fallback: 'errors.authorization' | 'errors.callback') {
    update({ view: 'error', busy: false, error: error instanceof LauncherError ? error.key : fallback })
  }
  async function execute(run: () => Promise<Result | void>, callback = false) {
    if (disposed || state.busy) return
    previous = state.view === 'error' ? previous : state.view
    const id = ++operation
    active = new AbortController()
    update({ busy: true, error: undefined, ...(callback ? { view: 'pending' as const } : {}) })
    let result: Result | void
    try {
      result = await run()
    } catch (error) {
      if (!disposed && id === operation) failure(error, callback ? 'errors.callback' : 'errors.authorization')
      return
    }
    if (disposed || id !== operation) return
    if (result !== undefined) {
      update({ view: 'complete', busy: false, result })
      options.onSuccess?.(result)
    }
    // Redirect adapters remain busy until navigation; never claim success without a result.
  }
  function start(request: Omit<AuthRequest, 'signal'>) {
    return execute(() => options.auth.start({ ...request, signal: active!.signal }))
  }
  return {
    providers,
    mode,
    allowCustomService: options.allowCustomService ?? false,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    showSignup() {
      if (mode !== 'signin') navigate('intro')
    },
    showSignIn() {
      if (mode !== 'signup') navigate('signin')
    },
    showProviders() {
      if (mode !== 'signin') navigate('providers')
    },
    back() {
      navigate(mode === 'signup' || state.view === 'providers' ? 'intro' : 'signin')
    },
    retry() {
      navigate(previous === 'pending' ? (mode === 'signup' ? 'intro' : 'signin') : previous)
    },
    async signIn(identifier) {
      if (disposed || state.busy || mode === 'signup') return
      let input: string
      try {
        input = normalizeIdentifier(identifier)
      } catch (error) {
        // Validation remains beside the handle field and preserves what was typed.
        update({ view: 'signin', identifier, error: error instanceof LauncherError ? error.key : 'errors.identifier' })
        return
      }
      update({ identifier: input })
      await start({ intent: 'signin', input })
    },
    async signUp(providerId) {
      if (disposed || state.busy || mode === 'signin') return
      const provider = providers.find(p => p.id === providerId)
      if (!provider) {
        update({ view: 'error', error: 'errors.provider' })
        return
      }
      await start({ intent: 'signup', input: provider.serviceUrl, provider })
    },
    async signUpCustom(service) {
      if (disposed || state.busy || mode === 'signin' || !options.allowCustomService) return
      let input: string
      try {
        input = normalizeService(service)
      } catch {
        update({ view: 'providers', error: 'errors.service' })
        return
      }
      await start({ intent: 'signup', input })
    },
    async finish(params) {
      await execute(() => {
        if (!options.auth.finish) throw new LauncherError('errors.callback')
        return options.auth.finish(params)
      }, true)
    },
    destroy() {
      disposed = true
      operation++
      active?.abort()
      listeners.clear()
    },
  }
}
