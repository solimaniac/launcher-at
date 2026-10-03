import { IdResolver, getPds, getHandle } from '@atproto/identity'
import { isValidHandle } from '@atproto/syntax'
import type { Logger } from 'pino'

export interface ResolvedIdentity { pds?: string; claimedHandle?: string }
export interface Identity {
  resolveDid(did: string): Promise<ResolvedIdentity | undefined>
  verifyHandle(did: string, claimedHandle?: string): Promise<string | undefined>
}

export function createIdentity(log: Logger, resolver: Pick<IdResolver, 'did' | 'handle'> = new IdResolver({ timeout: 3000 })): Identity {
  return {
    async resolveDid(did) {
      // No long-lived identity cache: hosting transitions need current DID data.
      const doc = await resolver.did.resolve(did, true)
      if (!doc) return undefined
      return { pds: getPds(doc), claimedHandle: getHandle(doc) }
    },
    async verifyHandle(did, claim) {
      const handle = claim?.toLowerCase()
      if (!handle || handle === 'handle.invalid' || !isValidHandle(handle)) return undefined
      try {
        if (await resolver.handle.resolve(handle) === did) return handle
        log.debug('Handle did not resolve back to account DID')
      } catch (err) {
        log.debug({ err }, 'Handle verification failed')
      }
      return undefined
    },
  }
}
