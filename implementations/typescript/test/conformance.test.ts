import { expect, test } from 'vitest'
import contract from '../../../contracts/v1/flow.json'
import corpus from '../../../contracts/v1/conformance.json'
import {
  createLoginFlow,
  english,
  LauncherError,
  type AuthRequest,
  type ErrorKey,
  type LoginFlowOptions,
  type LoginMode,
  type View,
} from '../src/index'
import { providers } from './fixtures'

interface Result {
  account: string
}
type Simulation = 'success' | 'redirect' | 'deferred' | 'error' | 'handoff'
interface SharedCase {
  id: string
  options?: Pick<LoginFlowOptions<Result>, 'mode' | 'providerAllowlist' | 'allowCustomService'>
  auth?: { start?: Simulation; finish?: Simulation; errorKey?: ErrorKey }
  configurationError?: boolean
  steps?: Array<{
    action: keyof typeof contract.actions | 'expect' | 'resolve'
    input?: string
    defer?: boolean
    state?: { view?: View; busy?: boolean; identifier?: string; error?: ErrorKey | null; hasResult?: boolean }
    providerIds?: string[]
    requestCount?: number
    requests?: Array<{ intent: string; input: string; providerId: string | null }>
    successCount?: number
    signalAborted?: boolean
  }>
}

test('shared contract names, defaults, and copy are usable by every implementation', () => {
  expect(corpus.version).toBe(contract.version)
  expect(new Set(corpus.cases.map(c => c.id)).size).toBe(corpus.cases.length)
  const views = new Set(Object.keys(contract.views))
  for (const [mode, definition] of Object.entries(contract.modes)) {
    expect(views.has(definition.initialView)).toBe(true)
    const flow = createLoginFlow({ providers, mode: mode as LoginMode, auth: { start: async () => {} } })
    expect(flow.getState().view).toBe(definition.initialView)
    flow.destroy()
  }
  const flow = createLoginFlow({ providers, auth: { start: async () => {} } })
  expect(flow.mode).toBe(contract.defaultMode)
  flow.destroy()
  for (const [key, error] of Object.entries(contract.errors)) {
    expect(views.has(error.view)).toBe(true)
    expect(typeof english[key]).toBe('string')
  }
  for (const message of Object.values(english)) {
    for (const match of message.matchAll(/\{\{(\w+)\}\}/g)) {
      expect(contract.copy.placeholders).toContain(match[1])
    }
  }
})

test.each(corpus.cases as unknown as SharedCase[])('portable flow: $id', async scenario => {
  const requests: AuthRequest[] = []
  const pending: Promise<void>[] = []
  const resolvers: Array<() => void> = []
  let successes = 0
  function outcome(simulation: Simulation = 'success'): Promise<Result | void> {
    if (simulation === 'error') {
      return Promise.reject(
        scenario.auth?.errorKey
          ? new LauncherError(scenario.auth.errorKey)
          : new Error('Simulated private SDK response'),
      )
    }
    if (simulation === 'redirect' || simulation === 'handoff') return Promise.resolve()
    if (simulation === 'deferred')
      return new Promise(resolve => {
        resolvers.push(() => resolve({ account: 'example' }))
      })
    return Promise.resolve({ account: 'example' })
  }
  const create = () =>
    createLoginFlow<Result>({
      providers,
      ...scenario.options,
      auth: {
        start(request) {
          requests.push(request)
          return outcome(scenario.auth?.start)
        },
        finish() {
          return outcome(scenario.auth?.finish)
        },
      },
      onSuccess() {
        successes++
      },
    })
  if (scenario.configurationError) {
    expect(create).toThrow()
    expect(requests).toHaveLength(0)
    return
  }
  const flow = create()
  try {
    for (const step of scenario.steps ?? []) {
      switch (step.action) {
        case 'expect': {
          const state = flow.getState()
          if (step.state)
            expect({
              view: state.view,
              busy: state.busy,
              identifier: state.identifier,
              error: state.error ?? null,
              hasResult: state.result !== undefined,
            }).toMatchObject(step.state)
          if (step.providerIds) expect(flow.providers.map(p => p.id)).toEqual(step.providerIds)
          if (step.requestCount !== undefined) expect(requests).toHaveLength(step.requestCount)
          if (step.requests)
            expect(
              requests.map(r => ({
                intent: r.intent,
                input: r.input,
                providerId: r.provider?.id ?? null,
              })),
            ).toEqual(step.requests)
          if (step.successCount !== undefined) expect(successes).toBe(step.successCount)
          if (step.signalAborted !== undefined) expect(requests.at(-1)?.signal.aborted).toBe(step.signalAborted)
          break
        }
        case 'showSignIn':
        case 'showSignup':
        case 'showProviders':
        case 'back':
        case 'retry':
        case 'destroy':
          flow[step.action]()
          break
        case 'signIn':
        case 'signUp':
        case 'signUpCustom': {
          const operation = flow[step.action](step.input ?? '')
          if (step.defer) pending.push(operation)
          else await operation
          break
        }
        case 'finish': {
          const operation = flow.finish(new URLSearchParams('code=simulated'))
          if (step.defer) pending.push(operation)
          else await operation
          break
        }
        case 'resolve':
          for (const resolve of resolvers.splice(0)) resolve()
          await Promise.all(pending.splice(0))
          break
        default:
          throw new Error(`Unknown conformance action: ${step.action}`)
      }
    }
  } finally {
    flow.destroy()
    for (const resolve of resolvers.splice(0)) resolve()
    await Promise.allSettled(pending)
  }
})
