import { launch } from './launcher'
import { oauth } from './oauth'
import { fetchJoinCounts, fetchRecentJoins, startJoinFeed } from './activity'
import './styles/main.scss'

const callback = location.pathname === '/callback.html'
const activity = __ACTIVITY_API__ && !callback ? __ACTIVITY_API__ : ''
const feed = document.querySelector<HTMLElement>('#activity')
if (activity && feed) startJoinFeed(feed, () => fetchRecentJoins(activity))
await launch(document.querySelector<HTMLElement>('#app')!, oauth, callback, activity ? fetchJoinCounts(activity) : undefined)
