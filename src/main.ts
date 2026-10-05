import { launch } from './launcher'
import { oauth } from './oauth'
import { fetchJoinCounts, fetchRecentJoins, startJoinFeed } from './activity'
import { selectApp } from './apps'
import { t } from './i18n'
import { createLaunchLayer } from './background/launches'
import providerSource from '../config/providers.json'
import { version } from '../package.json'
import { parseProviders } from './config'
import './styles/main.scss'

const SOURCE_URL = 'https://github.com/solimaniac/launcher-at'

const root = document.querySelector<HTMLElement>('#app')!
const isCallback = location.pathname === '/callback.html'
/** Activity backend origin; empty when activity is disabled or on the OAuth callback page. */
const activityApi = __ACTIVITY_API__ && !isCallback ? __ACTIVITY_API__ : ''

function renderSourceFooter() {
  const footer = document.createElement('footer')
  footer.className = 'source-footer'
  const link = document.createElement('a')
  link.href = SOURCE_URL
  link.textContent = 'GitHub'
  footer.append(document.createTextNode(`v${version} · ${t('site.source')} `), link)
  root.after(footer)
}

/** Shows recent signups as rocket launches in the background sky. */
function startLaunchAnimation(sky: HTMLElement) {
  const launches = createLaunchLayer(sky)
  const logos: Record<string, string | undefined> = Object.fromEntries(
    parseProviders(providerSource).map(provider => [provider.id, provider.logo]),
  )
  startJoinFeed(
    () => fetchRecentJoins(activityApi),
    join => {
      // Only the first handle segment is shown, e.g. `alice.bsky.social` → `alice`.
      const handle = join.handle.split('.', 1)[0]
      launches.launch({
        text: t('activity.joined', { handle, provider: join.providerName }),
        logo: logos[join.providerId],
      })
    },
  )
}

renderSourceFooter()

const sky = document.querySelector<HTMLElement>('#launches')
const animationEnabled = selectApp(new URLSearchParams(location.search).get('app')).app.launchAnimation !== false
// Apps that disable the animation skip the recent-joins poll entirely; nothing else consumes it.
if (activityApi && sky && animationEnabled) startLaunchAnimation(sky)

await launch(root, oauth, isCallback, activityApi ? fetchJoinCounts(activityApi) : undefined)
