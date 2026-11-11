import { createLoginFlow, LauncherError, translate, type AuthAdapter, type LoginMode } from 'launcher-components'
import { mountLogin, openLoginDialog, renderProviderPicker, type MountOptions } from 'launcher-components/dom'
import spanish from 'launcher-components/locales/es.json'
import { providers } from './providers'
import atmosphereApps from '../config/atmosphere-apps.json'
import { element } from './dom'
import { t } from './i18n'

type Layout = 'dialog' | 'inline' | 'fullscreen' | 'picker'
type Appearance = 'paper' | 'night' | 'editorial'
type Outcome = 'success' | 'retry' | 'cancelled'
export interface DemoResult {
  handle: string
}
const DEMO_DELAY_MS = 700
const COMPONENTS_URL = 'https://github.com/solimaniac/launcher-components'
const REGISTRY_URL = 'https://github.com/solimaniac/pds-registry'

/** Local simulation only: never resolves a handle, contacts a PDS, or creates an OAuth session. */
export function createDemoAuth(outcome: Outcome): AuthAdapter<DemoResult> {
  let attempts = 0
  return {
    async start(request) {
      request.signal.throwIfAborted()
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          window.clearTimeout(timer)
          reject(request.signal.reason)
        }
        const timer = window.setTimeout(() => {
          request.signal.removeEventListener('abort', abort)
          resolve()
        }, DEMO_DELAY_MS)
        request.signal.addEventListener('abort', abort, { once: true })
      })
      request.signal.throwIfAborted()
      attempts++
      if (outcome === 'cancelled') throw new LauncherError('errors.cancelled')
      if (outcome === 'retry' && attempts === 1) throw new LauncherError('errors.authorization')
      return {
        handle:
          request.intent === 'signup'
            ? 'new-account.demo.test'
            : request.input.startsWith('did:')
              ? 'demo-account.demo.test'
              : request.input,
      }
    },
  }
}

function action(key: string, onClick: () => void, className = 'demo-button') {
  const button = element('button', t(key), className)
  button.type = 'button'
  button.onclick = onClick
  return button
}
function link(key: string, href: string, className = 'demo-link') {
  const node = element('a', t(key), className)
  node.href = href
  return node
}
function mark() {
  const icon = element('span', '@', 'demo-mark')
  icon.setAttribute('aria-hidden', 'true')
  return icon
}
function select<T extends string>(key: string, values: readonly T[], value: T, change: (value: T) => void) {
  const label = element('label', t(`demo.${key}`), 'demo-field')
  const input = element('select')
  input.name = key
  for (const entry of values) {
    const option = element('option', t(`demo.${key}.${entry}`))
    option.value = entry
    input.append(option)
  }
  input.value = value
  input.onchange = () => change(input.value as T)
  label.append(input)
  return label
}

function networkArtwork() {
  const network = element('div', '', 'demo-network')
  network.setAttribute('aria-hidden', 'true')
  const ring = element('div', '', 'demo-network-ring')
  const core = element('span', '@', 'demo-network-core')
  network.append(ring, core)
  // Real app icons from the existing Atmosphere directory, never invented customer logos.
  for (const app of atmosphereApps.slice(0, 4)) {
    const node = element('span', '', 'demo-network-app')
    const image = element('img')
    image.src = app.logo
    image.alt = ''
    node.append(image)
    network.append(node)
  }
  return network
}

/** The website owns its design and demo adapter; every login screen uses the public package API. */
export function mountDemo(root: HTMLElement) {
  let layout: Layout = 'dialog'
  let appearance: Appearance = 'paper'
  let mode: LoginMode = 'both'
  let language = 'en'
  let outcome: Outcome = 'success'
  let transport: 'redirect' | 'popup' = 'redirect'
  let limited = false
  let custom = false
  const selected = new Set(
    providers
      .filter(provider => provider.enabled)
      .slice(0, 3)
      .map(provider => provider.id),
  )
  let stopPreview: (() => void) | undefined
  let stopDialog: (() => void) | undefined
  let pickerGeneration = 0
  let disposed = false

  document.title = t('demo.title')
  document.body.classList.add('demo-page')
  root.className = 'demo-main'
  root.removeAttribute('aria-live')
  const skip = link('demo.skip', '#playground', 'demo-skip')
  const header = element('header', '', 'demo-header')
  const headerInner = element('div', '', 'wrap demo-header-inner')
  const brand = link('demo.brand', '/', 'demo-brand')
  const logo = element('img', '', 'demo-launcher-logo')
  logo.src = '/logo.png'
  logo.alt = ''
  logo.width = 36
  logo.height = 36
  brand.prepend(logo)
  const label = element('span', t('demo.components'), 'demo-brand-label')
  brand.append(label)
  const navigation = element('nav', '', 'demo-navigation')
  navigation.setAttribute('aria-label', t('demo.navigation'))
  const source = link('demo.source', COMPONENTS_URL)
  source.append(element('span', ' ↗', 'demo-arrow'))
  const login = action('demo.login', () => openDialog('dialog'), 'demo-button demo-primary')
  login.setAttribute('aria-haspopup', 'dialog')
  navigation.append(source, login)
  headerInner.append(skip, brand, navigation)
  header.append(headerInner)

  const hero = element('section', '', 'demo-hero hero')
  hero.dataset.enter = ''
  const wrap = element('div', '', 'wrap')
  const intro = element('div', '', 'demo-intro')
  const heading = element('h1', t('demo.heading'))
  const introRight = element('div', '', 'demo-intro-right')
  introRight.append(element('span', t('demo.wip'), 'demo-wip'), element('p', t('demo.intro')))
  intro.append(heading, introRight)

  const playground = element('div', '', 'demo-playground app-frame')
  playground.id = 'playground'
  playground.tabIndex = -1
  const settings = element('aside', '', 'demo-settings')
  settings.setAttribute('aria-label', t('demo.settings'))
  const settingsHeading = element('h2', t('demo.playground'))
  const layouts = element('fieldset', '', 'demo-layouts')
  layouts.append(element('legend', t('demo.layout')))
  for (const value of ['dialog', 'inline', 'fullscreen', 'picker'] as const) {
    const label = element('label', '', 'demo-layout-option')
    const input = element('input')
    input.type = 'radio'
    input.name = 'layout'
    input.value = value
    input.checked = value === layout
    input.onchange = () => {
      layout = value
      renderPreview()
    }
    const text = element('span')
    text.append(element('span', t(`demo.layout.${value}`)), element('small', t(`demo.layout.${value}.hint`)))
    label.append(input, text)
    layouts.append(label)
  }
  const modeField = select('mode', ['both', 'signin', 'signup'] as const, mode, value => {
    mode = value
    renderPreview()
  })
  const appearanceField = select('appearance', ['paper', 'night', 'editorial'] as const, appearance, value => {
    appearance = value
    preview.dataset.appearance = value
    updateCode()
  })
  const languageField = select('language', ['en', 'es'], language, value => {
    language = value
    renderPreview()
  })
  const responseField = select('response', ['success', 'retry', 'cancelled'] as const, outcome, value => {
    outcome = value
    renderPreview()
  })

  const hosts = element('details', '', 'demo-host-settings')
  hosts.append(
    element('summary', t('demo.hostSettings', { count: providers.filter(provider => provider.enabled).length })),
  )
  const limitedLabel = element('label', '', 'demo-checkbox')
  const limitedInput = element('input')
  limitedInput.type = 'checkbox'
  limitedInput.name = 'limited'
  limitedLabel.append(limitedInput, element('span', t('demo.limitHosts')))
  const hostList = element('div', '', 'demo-host-list')
  hostList.hidden = true
  for (const provider of providers.filter(provider => provider.enabled)) {
    const label = element('label', '', 'demo-checkbox')
    const input = element('input')
    input.type = 'checkbox'
    input.value = provider.id
    input.checked = selected.has(provider.id)
    input.onchange = () => {
      if (input.checked) selected.add(provider.id)
      else selected.delete(provider.id)
      renderPreview()
    }
    label.append(input, element('span', provider.name))
    hostList.append(label)
  }
  const customLabel = element('label', '', 'demo-checkbox')
  const customInput = element('input')
  customInput.type = 'checkbox'
  customInput.name = 'custom'
  customInput.onchange = () => {
    custom = customInput.checked
    renderPreview()
  }
  customLabel.append(customInput, element('span', t('demo.customHost')))
  const policyHint = element('p', t('demo.hostPolicy'), 'demo-small')
  limitedInput.onchange = () => {
    limited = limitedInput.checked
    hostList.hidden = !limited
    customInput.disabled = limited
    renderPreview()
  }
  hosts.append(limitedLabel, hostList, customLabel, policyHint, link('demo.registry', REGISTRY_URL))
  settings.append(settingsHeading, modeField, appearanceField, languageField, responseField, hosts)

  const stage = element('div', '', 'demo-stage')
  const preview = element('div', '', 'demo-preview demo-surface')
  preview.dataset.appearance = appearance
  const previewHeader = element('div', '', 'demo-preview-header')
  const appBrand = element('span', '', 'demo-app-brand')
  appBrand.append(mark(), element('span', t('demo.yourApp')))
  const previewAction = action(
    'demo.login',
    () => openDialog(layout === 'fullscreen' ? 'fullscreen' : 'dialog'),
    'demo-button demo-primary',
  )
  previewAction.setAttribute('aria-haspopup', 'dialog')
  previewHeader.append(appBrand, previewAction)
  const previewBody = element('div', '', 'demo-preview-body')
  const stateBar = element('div', '', 'demo-state-bar')
  const simulation = element('span', t('demo.simulation'), 'demo-simulation')
  const state = element('span', '', 'demo-flow-state')
  state.setAttribute('role', 'status')
  state.setAttribute('aria-live', 'polite')
  const reset = action('demo.reset', renderPreview, 'demo-text-button')
  stateBar.append(simulation, state, reset)
  preview.append(previewHeader, previewBody)
  stage.append(preview, stateBar)
  playground.append(settings, stage)

  const implementation = element('details', '', 'demo-implementation')
  const codeSummary = element('summary', t('demo.code'))
  const codeToolbar = element('div', '', 'demo-code-toolbar')
  const transportField = select('transport', ['redirect', 'popup'] as const, transport, value => {
    transport = value
    updateCode()
  })
  const code = element('code')
  const copyCode = action(
    'demo.copyCode',
    () => {
      if (!navigator.clipboard) {
        copyCode.textContent = t('demo.copyFailed')
        return
      }
      void navigator.clipboard
        .writeText(code.textContent ?? '')
        .then(() => {
          copyCode.textContent = t('demo.copied')
        })
        .catch(() => {
          copyCode.textContent = t('demo.copyFailed')
        })
    },
    'demo-text-button',
  )
  codeToolbar.append(transportField, copyCode)
  const pre = element('pre')
  pre.append(code)
  implementation.append(codeSummary, codeToolbar, element('p', t('demo.transportHint'), 'demo-code-hint'), pre)
  wrap.append(intro, layouts, playground, implementation)
  hero.append(wrap)
  root.replaceChildren(hero)

  const footer = element('footer', '', 'demo-footer')
  const footerInner = element('div', '', 'wrap demo-footer-inner')
  const footerLinks = element('div', '', 'demo-footer-links')
  footerLinks.append(
    link('demo.componentsSource', COMPONENTS_URL),
    link('demo.registry', REGISTRY_URL),
    link('demo.liveOnboarding', '/?app=default'),
  )
  footerInner.append(element('span', t('demo.footer')), footerLinks)
  footer.append(footerInner)
  root.before(header)
  root.after(footer)

  const logoUrl: MountOptions<DemoResult>['logoUrl'] = provider =>
    provider.logo ? `/providers/${provider.logo}` : undefined
  function messages() {
    const catalog = translate(language === 'es' ? spanish : undefined)
    return (key: string, values?: Record<string, string | number>) => {
      if (key === 'oauth.opening') return t(`demo.${language}.opening`)
      if (key === 'complete.title') return t(`demo.${language}.complete`)
      return catalog(key, values)
    }
  }
  function options(restart: () => void): MountOptions<DemoResult> {
    return {
      appName: t(`demo.${language}.yourApp`),
      t: messages(),
      logoUrl,
      focusOnMount: false,
      onScreen(_node, view) {
        state.textContent = t(`demo.state.${view}`)
      },
      renderComplete(node, result) {
        node.append(element('p', `@${result.handle}`, 'demo-result-handle'), element('p', t(`demo.${language}.result`)))
        node.append(action(`demo.${language}.restart`, restart))
      },
    }
  }
  function flow() {
    return createLoginFlow({
      providers,
      mode,
      auth: createDemoAuth(outcome),
      ...(limited ? { providerAllowlist: [...selected] } : { allowCustomService: custom }),
    })
  }
  function openDialog(presentation: 'dialog' | 'fullscreen') {
    stopDialog?.()
    const controller = flow()
    const modal = openLoginDialog(controller, {
      ...options(() => {
        modal.destroy()
        openDialog(presentation)
      }),
      presentation: presentation === 'fullscreen' ? 'fullscreen' : 'inline',
      onClose() {
        controller.destroy()
        stopDialog = undefined
        state.textContent = t('demo.state.closed')
      },
    })
    modal.dialog.classList.add('demo-surface', 'demo-dialog')
    modal.dialog.dataset.appearance = appearance
    modal.dialog.lang = language
    const note = element('p', t(`demo.${language}.note`), 'demo-dialog-note')
    modal.dialog.prepend(note)
    if (presentation === 'fullscreen') {
      const aside = element('div', '', 'demo-fullscreen-aside')
      aside.setAttribute('aria-hidden', 'true')
      const brand = element('div', t('demo.fullscreenBrand'), 'demo-fullscreen-brand')
      brand.prepend(mark())
      aside.append(brand, element('p', t('demo.fullscreenTitle'), 'demo-fullscreen-title'), networkArtwork())
      modal.dialog.append(aside)
    }
    stopDialog = modal.destroy
  }
  function updateCode() {
    const config = [
      'const flow = createLoginFlow({',
      '  providers,',
      `  mode: '${mode}',`,
      ...(limited
        ? [`  providerAllowlist: ${JSON.stringify([...selected])},`]
        : custom
          ? ['  allowCustomService: true,']
          : []),
      '  auth, // Your OAuth adapter or backend',
      '})',
      '',
    ]
    if (layout === 'picker') {
      transportField.hidden = true
      code.textContent = [
        "import { renderProviderPicker } from 'launcher-components/dom'",
        "import { selectProviders } from 'pds-registry'",
        '',
        'const picker = renderProviderPicker(document, {',
        `  providers: selectProviders({ ids: ${limited ? JSON.stringify([...selected]) : 'undefined'} }),`,
        '  onSelect: provider => { /* Continue with provider.serviceUrl */ },',
        '  logoUrl: provider => `/providers/${provider.logo}`,',
        '})',
        'container.append(picker.element)',
      ].join('\n')
    } else {
      transportField.hidden = false
      const method = layout === 'inline' ? 'mountLogin' : 'openLoginDialog'
      code.textContent = [
        `import { createLoginFlow${language === 'es' ? ', translate' : ''} } from 'launcher-components'`,
        `import { ${method} } from 'launcher-components/dom'`,
        "import { createBrowserOAuthAdapter } from 'launcher-components/oauth'",
        "import { providers } from 'pds-registry'",
        ...(language === 'es' ? ["import messages from 'launcher-components/locales/es.json'"] : []),
        '',
        '// Supply your app’s configured BrowserOAuthClient.',
        'const auth = createBrowserOAuthAdapter(client, {',
        `  transport: '${transport}',`,
        '})',
        '',
        ...config,
        ...(layout === 'inline'
          ? ['mountLogin(container, flow, {', '  focusOnMount: false,']
          : ['// Call from your Log in button.', 'openLoginDialog(flow, {']),
        ...(layout === 'fullscreen' ? ["  presentation: 'fullscreen',"] : []),
        ...(layout !== 'inline' ? ['  onClose: () => flow.destroy(),'] : []),
        "  appName: 'Your app',",
        ...(language === 'es' ? ['  t: translate(messages),'] : []),
        '  logoUrl: provider => `/providers/${provider.logo}`,',
        '})',
      ].join('\n')
    }
    copyCode.textContent = t('demo.copyCode')
  }
  function welcome() {
    const home = element('div', '', 'demo-app-home')
    const network = networkArtwork()
    const title = element('h2', t('demo.canvasTitle'))
    const intro = element('p', t(layout === 'fullscreen' ? 'demo.canvasFullscreen' : 'demo.canvasIntro'))
    const start = action(
      layout === 'fullscreen' ? 'demo.openFullscreen' : 'demo.tryLogin',
      () => openDialog(layout === 'fullscreen' ? 'fullscreen' : 'dialog'),
      'demo-button demo-primary',
    )
    start.setAttribute('aria-haspopup', 'dialog')
    home.append(network, title, intro, start, element('span', t('demo.canvasHint'), 'demo-small'))
    previewBody.append(home)
  }
  function renderPreview() {
    if (disposed) return
    stopPreview?.()
    stopPreview = undefined
    stopDialog?.()
    pickerGeneration++
    previewBody.replaceChildren()
    previewBody.lang = language
    preview.dataset.layout = layout
    previewAction.hidden = layout === 'inline' || layout === 'picker'
    modeField.hidden = layout === 'picker'
    responseField.hidden = layout === 'picker'
    previewAction.textContent = t(layout === 'fullscreen' ? 'demo.openFullscreen' : 'demo.login')
    state.textContent = t('demo.state.ready')
    if (layout === 'inline') {
      const container = element('div', '', 'demo-inline')
      previewBody.append(container)
      const controller = flow()
      const unmount = mountLogin(container, controller, options(renderPreview))
      stopPreview = () => {
        unmount()
        controller.destroy()
      }
    } else if (layout === 'picker') {
      const container = element('div', '', 'demo-picker')
      container.dataset.launcher = ''
      container.append(element('h2', messages()('providers.title')), element('p', t('demo.pickerIntro')))
      const selectedHost = element('p', '', 'demo-selected-host')
      selectedHost.setAttribute('role', 'status')
      const generation = pickerGeneration
      const picker = renderProviderPicker(document, {
        providers: providers.filter(provider => !limited || selected.has(provider.id)),
        t: messages(),
        logoUrl,
        onSelect(provider) {
          if (generation !== pickerGeneration) return
          selectedHost.textContent = t('demo.selectedHost', { name: provider.name, url: provider.serviceUrl })
        },
      })
      container.append(selectedHost, picker.element)
      previewBody.append(container)
    } else welcome()
    updateCode()
  }
  renderPreview()
  return () => {
    disposed = true
    pickerGeneration++
    stopPreview?.()
    stopDialog?.()
    header.remove()
    footer.remove()
    root.replaceChildren()
    root.classList.remove('demo-main')
    document.body.classList.remove('demo-page')
  }
}
