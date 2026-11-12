import { validId } from './config'
import { LauncherError, type ErrorKey } from '@apogeekit/launcher-components'

export interface SignupResult {
  handle: string | null
  appId: string | null
  cleanupFailed: boolean
}
export interface SignupOAuth {
  start(serviceUrl: string, appId: string): Promise<void>
  finish(): Promise<SignupResult>
}
export class SignupError extends LauncherError {
  readonly appId: string | null
  constructor(key: ErrorKey, appId: string | null = null) {
    super(key, appId)
    this.appId = appId
  }
}
export function recoverAppId(state: unknown): string | null {
  return validId(state) ? state : null
}
