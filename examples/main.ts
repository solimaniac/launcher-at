import { createLoginFlow, LauncherError, type AccountProvider } from '../src/index'
import { mountLogin, openLoginDialog } from '../src/dom'
import '../styles.css'

// Deliberately fictional hosts for this offline UI harness. Use launcher-pds-dir in your real app.
const providers: AccountProvider[] = [
  {
    id: 'community',
    name: 'Community host',
    serviceUrl: 'https://community.example',
    description: 'An example host for testing account creation.',
    region: 'Canada',
    enabled: true,
    requiresInvite: false,
  },
  {
    id: 'invited',
    name: 'Invite host',
    serviceUrl: 'https://invited.example',
    description: 'An example host that requires an invitation.',
    region: 'European Union',
    enabled: true,
    requiresInvite: true,
  },
]

function makeFlow() {
  return createLoginFlow({
    providers,
    allowCustomService: true,
    auth: {
      async start(request) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, 150)
          request.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout)
              reject(new DOMException('Cancelled', 'AbortError'))
            },
            { once: true },
          )
        })
        if (document.querySelector<HTMLSelectElement>('#outcome')!.value === 'failure')
          throw new LauncherError('errors.authorization')
        return { handle: request.intent === 'signin' ? request.input : 'new-account.community.example' }
      },
    },
  })
}
const options = { appName: 'Example app' }
let flow = makeFlow()
let unmount = mountLogin(document.querySelector<HTMLElement>('#inline')!, flow, options)
document.querySelector<HTMLSelectElement>('#theme')!.onchange = event => {
  document.body.dataset.theme = (event.target as HTMLSelectElement).value
}
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => {
  unmount()
  flow.destroy()
  flow = makeFlow()
  unmount = mountLogin(document.querySelector<HTMLElement>('#inline')!, flow, options)
}
document.querySelector<HTMLButtonElement>('#open-dialog')!.onclick = () => {
  const modalFlow = makeFlow()
  openLoginDialog(modalFlow, { ...options, onClose: () => modalFlow.destroy() })
}
let closeFullScreen: (() => void) | undefined
document.querySelector<HTMLButtonElement>('#open-fullscreen')!.onclick = () => {
  const section = document.querySelector<HTMLElement>('#fullscreen')!
  section.hidden = false
  const fullFlow = makeFlow()
  const stop = mountLogin(document.querySelector<HTMLElement>('#fullscreen-content')!, fullFlow, {
    ...options,
    presentation: 'fullscreen',
    headingLevel: 1,
  })
  closeFullScreen = () => {
    stop()
    fullFlow.destroy()
    section.hidden = true
    document.querySelector<HTMLButtonElement>('#open-fullscreen')!.focus()
  }
}
document.querySelector<HTMLButtonElement>('#close-fullscreen')!.onclick = () => closeFullScreen?.()
