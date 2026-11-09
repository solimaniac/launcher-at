import type { AccountProvider } from '../src/index'
export const providers: AccountProvider[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    serviceUrl: 'https://alpha.test',
    description: 'A community host.',
    region: 'Canada',
    enabled: true,
    requiresInvite: false,
  },
  {
    id: 'beta',
    name: 'Beta',
    serviceUrl: 'https://beta.test',
    description: 'Another account host.',
    region: 'European Union',
    enabled: true,
    requiresInvite: true,
  },
  {
    id: 'gamma',
    name: 'Gamma',
    serviceUrl: 'https://gamma.test',
    description: 'A third host.',
    region: 'Canada',
    enabled: true,
  },
  {
    id: 'disabled',
    name: 'Disabled',
    serviceUrl: 'https://disabled.test',
    description: 'Unavailable.',
    region: 'Japan',
    enabled: false,
  },
]
