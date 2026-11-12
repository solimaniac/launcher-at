import { createLoginFlow, LauncherError } from '@apogeekit/launcher-components'
import { mountLogin } from '@apogeekit/launcher-components/dom'
import { t } from './i18n'
import { providers as providerSource } from './providers'
import { DEFAULT_APP_ID, parseProviders, httpsUrl } from './config'
import { selectApp, applyTheme } from './apps'
import { SignupError, type SignupOAuth } from './signup'
import { element } from './dom'
import { renderAppCarousel } from './carousel'

const REDIRECT_SECONDS = 8

/** App branding, configured return destinations, and discovery stay in the launcher. */
export async function launch(root: HTMLElement, oauth: SignupOAuth, callback = false) {
  let selection = selectApp(callback ? null : new URLSearchParams(location.search).get('app'))
  let app = selection.app
  applyTheme(app)
  let countdown: number | undefined
  let stopCarousel: (() => void) | undefined
  let stopFlow: (() => void) | undefined
  const isDefaultApp = () => app.id === DEFAULT_APP_ID

  function stopCountdown() {
    window.clearInterval(countdown)
    countdown = undefined
  }
  function clearFlow() {
    stopFlow?.()
    stopFlow = undefined
  }
  function decorate() {
    document.title = isDefaultApp() ? t('site.title') : t('embed.appTitle', { appName: app.appName })
    document.querySelector('link[rel="icon"]')?.remove()
    if (!isDefaultApp()) {
      const icon = element('link')
      icon.rel = 'icon'
      icon.href = app.logo_url ?? '/favicon.png?v=transparent'
      document.head.append(icon)
      const brand = element('div', app.appName, 'brand')
      const logo = element('img', '', 'app-logo')
      logo.src = app.logo_url ?? '/logo.png'
      logo.alt = ''
      logo.referrerPolicy = 'no-referrer'
      brand.prepend(logo)
      root.prepend(brand)
    }
  }
  function screen(title: string, ...content: HTMLElement[]) {
    clearFlow()
    stopCountdown()
    stopCarousel?.()
    stopCarousel = undefined
    root.removeAttribute('aria-busy')
    const heading = element('h1', title)
    heading.tabIndex = -1
    root.replaceChildren(heading, ...content)
    decorate()
    heading.focus({ preventScroll: true })
  }
  function unknownAppNotice() {
    if (selection.unknown) root.append(element('p', t('errors.unknownApp'), 'notice'))
  }
  function intro() {
    clearFlow()
    try {
      const flow = createLoginFlow({
        providers: parseProviders(providerSource),
        providerAllowlist: app.providerAllowlist,
        mode: 'signup',
        auth: {
          async start(request) {
            try {
              await oauth.start(request.input, app.id)
            } catch (error) {
              if (error instanceof SignupError) throw new LauncherError(error.key)
              throw error
            }
          },
        },
      })
      const unmount = mountLogin(root, flow, {
        ...(isDefaultApp() ? {} : { appName: app.appName }),
        headingLevel: 1,
        idPrefix: 'provider',
        t: (key, values) => t(key, values ?? {}),
        logoUrl: provider => (provider.logo ? `/providers/${provider.logo}` : undefined),
        onScreen(_root, view) {
          decorate()
          if (view === 'intro') unknownAppNotice()
        },
      })
      stopFlow = () => {
        unmount()
        flow.destroy()
      }
    } catch {
      showError('errors.providers', intro)
    }
  }
  function restart() {
    history.replaceState(null, '', isDefaultApp() ? '/' : `/?app=${encodeURIComponent(app.id)}`)
    intro()
  }
  function showError(key: string, retry: () => void) {
    screen(t('errors.title'), element('p', t(key)))
    root.dataset.view = 'error'
    const retryButton = element('button', t('actions.retry'))
    retryButton.onclick = retry
    const startOver = element('button', t('actions.restart'), 'secondary')
    startOver.onclick = restart
    root.append(retryButton, startOver)
  }

  function complete(handle: string | null, cleanupFailed: boolean) {
    screen(t('complete.title'))
    root.dataset.view = 'complete'
    if (handle) {
      const identity = element('section', undefined, 'completion-identity')
      identity.setAttribute('aria-labelledby', 'completion-handle')
      const accountHandle = element('p', `@${handle}`, 'completion-handle')
      accountHandle.id = 'completion-handle'
      identity.append(accountHandle, element('p', t('complete.handleHint'), 'completion-handle-hint'))
      root.append(identity)
    } else {
      root.append(element('p', t('complete.handleUnavailable'), 'completion-handle-unavailable'))
    }
    if (!isDefaultApp()) root.append(element('p', t('complete.app', { appName: app.appName })))
    unknownAppNotice()
    if (cleanupFailed) root.append(element('p', t('errors.cleanup')))
    if (isDefaultApp()) stopCarousel = renderAppCarousel(root)
    if (app.redirectUrl) startRedirect(app.redirectUrl)
  }

  /** Counts down, then navigates to the app's return URL. A fallback link allows returning sooner. */
  function startRedirect(redirectUrl: string) {
    let destination: string
    try {
      destination = httpsUrl(redirectUrl)
    } catch {
      root.append(element('p', t('errors.redirect')))
      return
    }
    const fallback = element('p', `${t('complete.redirectFallback')} `, 'redirect-fallback')
    const link = element('a', t('complete.redirectHere'))
    link.setAttribute('aria-label', t('complete.redirectLink', { appName: app.appName }))
    link.href = destination
    link.onclick = stopCountdown
    fallback.append(link, document.createTextNode('.'))

    let remaining = REDIRECT_SECONDS
    const status = element('p', t('complete.countdown', { appName: app.appName, count: remaining }))
    root.append(status, fallback)
    countdown = window.setInterval(() => {
      remaining -= 1
      if (remaining === 0) {
        stopCountdown()
        location.assign(destination)
      } else {
        status.textContent = t('complete.countdown', { appName: app.appName, count: remaining })
      }
    }, 1000)
  }

  /** Switches to the app recovered from the OAuth state (or the default app). */
  function useApp(appId: string | null) {
    selection = selectApp(appId)
    app = selection.app
    applyTheme(app)
  }

  async function finishCallback() {
    screen(t('oauth.finishing'))
    root.dataset.view = 'pending'
    root.setAttribute('aria-busy', 'true')
    try {
      const result = await oauth.finish()
      useApp(result.appId)
      complete(result.handle, result.cleanupFailed)
    } catch (error) {
      useApp(error instanceof SignupError ? error.appId : null)
      showError(error instanceof SignupError ? error.key : 'errors.callback', restart)
    }
  }

  window.addEventListener('pagehide', stopCountdown)
  if (callback) await finishCallback()
  else intro()

  return () => {
    clearFlow()
    stopCountdown()
    stopCarousel?.()
    window.removeEventListener('pagehide', stopCountdown)
  }
}
