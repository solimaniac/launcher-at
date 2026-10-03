import { launch } from './launcher'
import { oauth } from './oauth'
import './styles/main.scss'

await launch(document.querySelector<HTMLElement>('#app')!, oauth, location.pathname === '/callback.html')
