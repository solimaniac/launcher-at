import { launch } from './launcher'
import { oauth } from './oauth'
import { fetchJoinCounts, fetchRecentJoins, startJoinFeed } from './activity'
import { selectApp } from './apps'
import { t } from './i18n'
import { createLaunchLayer } from './background/launches'
import './styles/main.scss'

const callback = location.pathname === '/callback.html'
const activity = __ACTIVITY_API__ && !callback ? __ACTIVITY_API__ : ''
const sky = document.querySelector<HTMLElement>('#launches')
// Disabled apps skip the recent-joins poll entirely; nothing else consumes it.
if (activity && sky && selectApp(new URLSearchParams(location.search).get('app')).app.launchAnimation !== false) {
  const launches = createLaunchLayer(sky)
  startJoinFeed(() => fetchRecentJoins(activity), join => launches.launch(t('activity.joined', { handle: join.handle, provider: join.providerName })))
}
await launch(document.querySelector<HTMLElement>('#app')!, oauth, callback, activity ? fetchJoinCounts(activity) : undefined)
