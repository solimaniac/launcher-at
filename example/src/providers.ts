import { providers as directory } from 'launcher-pds-dir'

/** App-local objects backed by the versioned package; no separate directory snapshot. */
export const providers = directory.map(provider => ({ ...provider }))
