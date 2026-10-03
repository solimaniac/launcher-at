import { t } from './i18n'
import providerSource from '../config/providers.json'
import { parseProviders, httpsUrl, type Provider } from './config'
import { selectApp, applyTheme } from './apps'
import { SignupError, type SignupOAuth } from './signup'

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

export async function launch(root: HTMLElement, oauth: SignupOAuth, callback = false) {
  document.title = t('site.title')
  let selection = selectApp(callback ? null : new URLSearchParams(location.search).get('app'))
  let app = selection.app
  let providers: Provider[] | undefined
  let countdown: number | undefined
  applyTheme(app)

  function stopCountdown() {
    window.clearInterval(countdown)
    countdown = undefined
  }
  function screen(title: string, ...content: HTMLElement[]) {
    stopCountdown()
    root.removeAttribute('aria-busy')
    const heading = element('h1', title)
    heading.tabIndex = -1
    root.replaceChildren(heading, ...content)
    if (app.logo) {
      const logo = element('img')
      logo.src = app.logo
      logo.alt = app.appName
      logo.className = 'app-logo'
      root.prepend(logo)
    }
    heading.focus({ preventScroll: true })
  }
  function unknownAppNotice() {
    if (!selection.unknown) return
    const notice = element('p', t('errors.unknownApp'))
    notice.className = 'notice'
    root.append(notice)
  }
  function intro() {
    screen(t('intro.title'), element('p', app.id === 'default' ? t('intro.generic') : t('intro.app', { appName: app.appName })))
    unknownAppNotice()
    const list = element('ul')
    for (const key of ['network', 'hosting', 'reuse', 'ownership']) list.append(element('li', t(`intro.${key}`)))
    const create = element('button', t('intro.create'))
    create.onclick = selector
    root.append(list, create)
  }
  function selector() {
    try { providers ??= parseProviders(providerSource).filter(p => p.enabled) }
    catch { showError('errors.providers', selector); return }
    screen(t('providers.title'), element('p', t('providers.intro')))
    const cards = element('div')
    cards.className = 'providers'
    for (const provider of providers) {
      const card = element('button')
      card.className = 'provider'
      card.setAttribute('aria-label', t('providers.choose', { name: provider.name }))
      if (provider.logo) {
        const logo = element('img')
        logo.src = provider.logo
        logo.alt = ''
        card.append(logo)
      }
      const region = element('span', t('providers.region', { region: provider.region }))
      region.className = 'region'
      card.append(element('strong', provider.name), region, element('span', t(provider.description)))
      card.onclick = async () => {
        for (const button of root.querySelectorAll('button')) button.disabled = true
        root.setAttribute('aria-busy', 'true')
        root.append(element('p', t('oauth.opening')))
        try { await oauth.start(provider.serviceUrl, app.id) }
        catch (error) { showError(error instanceof SignupError ? error.key : 'errors.authorization', selector) }
      }
      cards.append(card)
    }
    if (!providers.length) cards.append(element('p', t('providers.empty')))
    const back = element('button', t('actions.back'))
    back.onclick = intro
    root.append(cards, back)
  }
  function restart() {
    history.replaceState(null, '', app.id === 'default' ? '/' : `/?app=${encodeURIComponent(app.id)}`)
    intro()
  }
  function showError(key: string, retry: () => void) {
    screen(t('errors.title'), element('p', t(key)))
    const button = element('button', t('actions.retry'))
    button.onclick = retry
    const startOver = element('button', t('actions.restart'))
    startOver.className = 'secondary'
    startOver.onclick = restart
    root.append(button, startOver)
  }
  function complete(cleanupFailed: boolean) {
    screen(t('complete.title'), element('p', app.id === 'default' ? t('complete.generic') : t('complete.app', { appName: app.appName })))
    unknownAppNotice()
    if (cleanupFailed) root.append(element('p', t('errors.cleanup')))
    if (!app.redirectUrl) return
    let destination: string
    try { destination = httpsUrl(app.redirectUrl) }
    catch { root.append(element('p', t('errors.redirect'))); return }
    const link = element('a', t('complete.return', { appName: app.appName }))
    link.className = 'button'
    link.href = destination
    link.onclick = stopCountdown
    const stay = element('button', t('complete.stay'))
    stay.className = 'secondary'
    let remaining = 5
    const status = element('p', t('complete.countdown', { appName: app.appName, count: remaining }))
    stay.onclick = () => {
      stopCountdown()
      status.textContent = t('complete.paused')
      stay.remove()
    }
    root.append(link, stay, status)
    countdown = window.setInterval(() => {
      remaining -= 1
      if (remaining === 0) {
        stopCountdown()
        location.assign(destination)
      } else status.textContent = t('complete.countdown', { appName: app.appName, count: remaining })
    }, 1000)
  }
  window.addEventListener('pagehide', stopCountdown)
  if (callback) {
    screen(t('oauth.finishing'))
    root.setAttribute('aria-busy', 'true')
    try {
      const result = await oauth.finish()
      selection = selectApp(result.appId)
      app = selection.app
      applyTheme(app)
      complete(result.cleanupFailed)
    } catch (error) {
      selection = selectApp(error instanceof SignupError ? error.appId : null)
      app = selection.app
      applyTheme(app)
      showError(error instanceof SignupError ? error.key : 'errors.callback', restart)
    }
  } else intro()
  return () => {
    stopCountdown()
    window.removeEventListener('pagehide', stopCountdown)
  }
}
