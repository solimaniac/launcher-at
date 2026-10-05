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

const footer = document.createElement('footer')
footer.className = 'source-footer'
const source = document.createElement('a')
source.href = 'https://github.com/solimaniac/launcher-at'
source.textContent = 'GitHub'
footer.append(document.createTextNode(`v${version} · ${t('site.source')} `), source)
document.querySelector('#app')!.after(footer)
const callback = location.pathname === '/callback.html'
const activity = __ACTIVITY_API__ && !callback ? __ACTIVITY_API__ : ''
const sky = document.querySelector<HTMLElement>('#launches')
// Disabled apps skip the recent-joins poll entirely; nothing else consumes it.
if (activity && sky && selectApp(new URLSearchParams(location.search).get('app')).app.launchAnimation !== false) {
  const launches = createLaunchLayer(sky)
  const logos: Record<string, string | undefined> = Object.fromEntries(
    parseProviders(providerSource).map(provider => [provider.id, provider.logo]),
  )
  startJoinFeed(
    () => fetchRecentJoins(activity),
    join => {
      const handle = join.handle.split('.', 1)[0]
      launches.launch({
        text: t('activity.joined', { handle, provider: join.providerName }),
        logo: logos[join.providerId],
      })
    },
  )
}
await launch(
  document.querySelector<HTMLElement>('#app')!,
  oauth,
  callback,
  activity ? fetchJoinCounts(activity) : undefined,
)
