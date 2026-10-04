import { t } from './i18n'
import providerSource from '../config/providers.json'
import { parseProviders, httpsUrl, type Provider } from './config'
import { selectApp, applyTheme } from './apps'
import { SignupError, type SignupOAuth } from './signup'
import { formatJoinCount, type JoinCounts } from './activity'

const regionFlags: Record<string, string> = {
  'United States': '🇺🇸',
  Europe: '🇪🇺',
  Canada: '🇨🇦',
  Japan: '🇯🇵',
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

export async function launch(root: HTMLElement, oauth: SignupOAuth, callback = false, counts?: Promise<JoinCounts>) {
  document.title = t('site.title')
  let selection = selectApp(callback ? null : new URLSearchParams(location.search).get('app'))
  let app = selection.app
  let providers: Provider[] | undefined
  let countdown: number | undefined
  applyTheme(app)
  let joinCounts: JoinCounts | undefined
  // Counts are decoration: failures leave the selector unchanged.
  counts?.then(result => { joinCounts = result; showCounts() }, () => {})
  function showCounts() {
    if (!joinCounts) return
    for (const node of root.querySelectorAll<HTMLElement>('.provider .joins')) {
      const joined = joinCounts.providers.get(node.dataset.provider!)
      if (joined !== undefined) node.textContent = t('providers.joined', { joined: formatJoinCount(joined), days: joinCounts.windowDays })
    }
  }

  function stopCountdown() {
    window.clearInterval(countdown)
    countdown = undefined
  }
  function screen(title: string, ...content: HTMLElement[]) {
    stopCountdown()
    root.removeAttribute('aria-busy')
    const heading = element('h1', title)
    heading.tabIndex = -1
    const brand = element('div', app.appName)
    brand.className = 'brand'
    root.replaceChildren(brand, heading, ...content)
    const logo = element('img')
    logo.src = app.logo_url ?? '/logo.png'
    logo.alt = ''
    logo.className = 'app-logo'
    logo.referrerPolicy = 'no-referrer'
    brand.prepend(logo)
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
    root.dataset.view = 'intro'
    unknownAppNotice()
    const list = element('ul')
    list.className = 'benefits'
    for (const key of ['network', 'hosting', 'reuse', 'ownership']) {
      const item = element('li')
      item.append(element('strong', t(`intro.${key}Title`)), element('p', t(`intro.${key}`)))
      list.append(item)
    }
    const create = element('button', t('intro.create'))
    create.onclick = selector
    root.append(create, list)
  }
  function selector() {
    try { providers ??= parseProviders(providerSource).filter(p => p.enabled) }
    catch { showError('errors.providers', selector); return }
    screen(t('providers.title'), element('p', t('providers.intro')))
    root.dataset.view = 'providers'
    const cards = element('div')
    cards.className = 'providers'
    for (const provider of providers) {
      const card = element('button')
      card.className = 'provider'
      card.setAttribute('aria-label', t('providers.choose', { name: provider.name }))
      const details = element('span')
      details.className = 'provider-details'
      if (provider.logo) {
        const logo = element('img')
        logo.src = provider.logo
        logo.alt = ''
        card.append(logo)
      }
      const region = element('span')
      const flag = element('span', regionFlags[provider.region] ?? '🌐')
      flag.setAttribute('aria-hidden', 'true')
      region.append(flag, document.createTextNode(` ${provider.region}`))
      region.className = 'region'
      region.id = `provider-${provider.id}-region`
      const joins = element('span')
      joins.className = 'joins'
      joins.dataset.provider = provider.id
      const description = element('span', t(provider.description))
      description.className = 'provider-description'
      description.id = `provider-${provider.id}-description`
      card.setAttribute('aria-describedby', `${region.id} ${description.id}`)
      details.append(element('strong', provider.name), region, description, joins)
      card.append(details)
      if (provider.requiresInvite) {
        const invite = element('span', t('providers.inviteRequired'))
        invite.className = 'invite-required'
        details.append(invite)
        card.setAttribute('aria-label', `${t('providers.choose', { name: provider.name })}. ${t('providers.inviteRequired')}`)
      }
      card.onclick = async () => {
        for (const button of root.querySelectorAll('button')) button.disabled = true
        root.setAttribute('aria-busy', 'true')
        const status = element('p', t('oauth.opening'))
        status.className = 'notice'
        status.setAttribute('role', 'status')
        root.append(status)
        try { await oauth.start(provider.serviceUrl, app.id) }
        catch (error) { showError(error instanceof SignupError ? error.key : 'errors.authorization', selector) }
      }
      cards.append(card)
    }
    if (!providers.length) cards.append(element('p', t('providers.empty')))
    const back = element('button', t('actions.back'))
    back.className = 'secondary'
    back.onclick = intro
    root.append(cards)
    root.append(back)
    showCounts()
  }
  function restart() {
    history.replaceState(null, '', app.id === 'default' ? '/' : `/?app=${encodeURIComponent(app.id)}`)
    intro()
  }
  function showError(key: string, retry: () => void) {
    screen(t('errors.title'), element('p', t(key)))
    root.dataset.view = 'error'
    const button = element('button', t('actions.retry'))
    button.onclick = retry
    const startOver = element('button', t('actions.restart'))
    startOver.className = 'secondary'
    startOver.onclick = restart
    root.append(button, startOver)
  }
  function complete(cleanupFailed: boolean) {
    screen(t('complete.title'), element('p', app.id === 'default' ? t('complete.generic') : t('complete.app', { appName: app.appName })))
    root.dataset.view = 'complete'
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
    root.dataset.view = 'pending'
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
