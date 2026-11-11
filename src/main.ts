import { t } from './i18n'
import { version } from '../package.json'
import { mountDemo } from './demo'
import './styles/main.scss'

const SOURCE_URL = 'https://github.com/solimaniac/launcher-at'

const root = document.querySelector<HTMLElement>('#app')!
const isCallback = location.pathname === '/callback.html'
function renderSourceFooter() {
  const footer = document.createElement('footer')
  footer.className = 'source-footer'
  const link = document.createElement('a')
  link.href = SOURCE_URL
  link.textContent = 'GitHub'
  footer.append(document.createTextNode(`v${version} · ${t('site.source')} `), link)
  root.after(footer)
}

if (isCallback || new URLSearchParams(location.search).has('app')) {
  const [{ launch }, { oauth }] = await Promise.all([import('./launcher'), import('./oauth')])
  document.body.classList.add('onboarding-page')
  renderSourceFooter()
  await launch(root, oauth, isCallback)
} else {
  mountDemo(root)
}
