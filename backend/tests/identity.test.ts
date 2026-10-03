import { expect, test, vi } from 'vitest'
import { IdResolver } from '@atproto/identity'
import { pino } from 'pino'
import { createIdentity } from '../src/identity.ts'
const did = 'did:plc:abcdefghijklmnopqrstuvwx'
const doc = { id: did, alsoKnownAs: ['at://custom.example'], service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://amanita.us-east.host.bsky.network' }] }

test('PDS comes from DID document, custom handle is accepted only bidirectionally', async () => {
  const resolver = new IdResolver()
  vi.spyOn(resolver.did, 'resolve').mockResolvedValue(doc)
  vi.spyOn(resolver.handle, 'resolve').mockResolvedValue(did)
  const identity = createIdentity(pino({ level: 'silent' }), resolver)
  expect(await identity.resolveDid(did)).toEqual({ pds: 'https://amanita.us-east.host.bsky.network', claimedHandle: 'custom.example' })
  expect(await identity.verifyHandle(did, 'CUSTOM.EXAMPLE')).toBe('custom.example')
  vi.mocked(resolver.handle.resolve).mockResolvedValue('did:plc:someoneelse')
  expect(await identity.verifyHandle(did, 'custom.example')).toBeUndefined()
  vi.mocked(resolver.handle.resolve).mockRejectedValue(new Error('network'))
  expect(await identity.verifyHandle(did, 'custom.example')).toBeUndefined()
})
test('invalid handle and malformed/missing PDS are never display data', async () => {
  const resolver = new IdResolver()
  vi.spyOn(resolver.did, 'resolve').mockResolvedValue({ ...doc, service: [{ ...doc.service[0]!, serviceEndpoint: 'not a URL' }] })
  const handle = vi.spyOn(resolver.handle, 'resolve')
  const identity = createIdentity(pino({ level: 'silent' }), resolver)
  expect((await identity.resolveDid(did))?.pds).toBeUndefined()
  for (const claim of [undefined, 'handle.invalid', 'bad/path', '@example.com']) expect(await identity.verifyHandle(did, claim)).toBeUndefined()
  expect(handle).not.toHaveBeenCalled()
  vi.mocked(resolver.did.resolve).mockResolvedValue(null)
  expect(await identity.resolveDid(did)).toBeUndefined()
})
