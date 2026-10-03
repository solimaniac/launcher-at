import { t } from './i18n'
import './styles/main.scss'

const root = document.querySelector<HTMLElement>('#app')!
document.title = t('site.title')
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
function intro() {
  root.replaceChildren(element('h1', t('intro.title')), element('p', t('intro.generic')))
  const list = element('ul')
  for (const key of ['network', 'hosting', 'reuse']) list.append(element('li', t(`intro.${key}`)))
  const create = element('button', t('intro.create'))
  root.append(list, create)
}
intro()
