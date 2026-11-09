import type { ErrorKey, Intent, View } from './contract-types'
export type { ErrorKey, Intent, LoginMode, View } from './contract-types'

/** Structural contract: launcher-pds-dir providers can be passed directly. */
export interface AccountProvider {
  readonly id: string
  readonly name: string
  readonly serviceUrl: string
  readonly description: string
  readonly region: string
  readonly enabled: boolean
  readonly requiresInvite?: boolean
  readonly logo?: string
}

/** Public failures contain a message key, never a library error or OAuth response. */
export class LauncherError extends Error {
  readonly key: ErrorKey
  readonly state: string | null
  constructor(key: ErrorKey, state: string | null = null) {
    super(key)
    this.name = 'LauncherError'
    this.key = key
    this.state = state
  }
}

export interface AuthRequest {
  readonly intent: Intent
  /** An existing account handle/DID for signin; a host URL for signup. */
  readonly input: string
  readonly provider?: AccountProvider
  readonly signal: AbortSignal
}

/** Supply the browser SDK adapter, or connect these operations to your backend. */
export interface AuthAdapter<Result> {
  /** Redirect adapters resolve void; popup/backend adapters may return a result. */
  start(request: AuthRequest): Promise<Result | void>
  /** A popup callback may resolve void after handing control back to its opener. */
  finish?(params?: URLSearchParams): Promise<Result | void>
}

export interface LoginState<Result> {
  readonly view: View
  readonly busy: boolean
  readonly identifier: string
  readonly error?: ErrorKey
  readonly result?: Result
}

export type Translate = (key: string, values?: Record<string, string | number>) => string
