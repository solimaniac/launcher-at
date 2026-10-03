import { validId } from './config'

export interface SignupResult { did: string; appId: string | null; cleanupFailed: boolean }
export interface SignupOAuth {
  start(serviceUrl: string, appId: string): Promise<void>
  finish(): Promise<SignupResult>
}
export class SignupError extends Error {
  readonly key: string
  readonly appId: string | null
  constructor(key: string, appId: string | null = null) {
    super(key)
    this.key = key
    this.appId = appId
  }
}
export function recoverAppId(state: unknown): string | null { return validId(state) ? state : null }
