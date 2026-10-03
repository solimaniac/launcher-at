import { t } from './i18n'
import providerSource from '../config/providers.json'
import { parseProviders } from './config'
import { selectApp, applyTheme } from './apps'
import './styles/main.scss'

const root = document.querySelector<HTMLElement>('#app')!
document.title = t('site.title')
const selection = selectApp(new URLSearchParams(location.search).get('app'))
const app = selection.app
applyTheme(app)
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
function intro() {
  root.replaceChildren(element('h1', t('intro.title')), element('p', app.id === 'default' ? t('intro.generic') : t('intro.app', { appName: app.appName })))
  if (selection.unknown) root.append(element('p', t('errors.unknownApp')))
  const list = element('ul')
  for (const key of ['network', 'hosting', 'reuse']) list.append(element('li', t(`intro.${key}`)))
  const create = element('button', t('intro.create'))
  create.onclick = selector
  root.append(list, create)
}
function selector() {
  root.replaceChildren(element('h1', t('providers.title')), element('p', t('providers.intro')))
  const cards = element('div')
  cards.className = 'providers'
  for (const provider of parseProviders(providerSource).filter(p => p.enabled)) {
    const card = element('button')
    card.className = 'provider'
    card.setAttribute('aria-label', t('providers.choose', { name: provider.name }))
    if (provider.logo) {
      const logo = element('img')
      logo.src = provider.logo
      logo.alt = ''
      card.append(logo)
    }
    card.append(element('strong', provider.name), element('span', t(provider.description)))
    cards.append(card)
  }
  const back = element('button', t('actions.back'))
  back.onclick = intro
  root.append(cards, back)
}
intro()
