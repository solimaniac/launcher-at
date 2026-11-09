import { readFileSync, writeFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(new URL('../contracts/v1/flow.json', import.meta.url), 'utf8'))
const output = new URL('../implementations/typescript/src/contract-types.ts', import.meta.url)
const groups = { LoginMode: 'modes', View: 'views', Intent: 'intents', ErrorKey: 'errors' }
const declarations = Object.entries(groups).map(([name, key]) => {
  const values = Object.keys(contract[key])
  if (!values.length) throw new Error(`The shared contract has no ${key}`)
  return `export type ${name} = ${values.map(value => JSON.stringify(value)).join(' | ')}`
})
const expected = `// Generated from contracts/v1/flow.json. Run npm run generate:contracts.\n${declarations.join('\n')}\n`

if (process.argv.includes('--check')) {
  let actual
  try {
    actual = readFileSync(output, 'utf8')
  } catch {
    /* Report the same actionable error for a missing generated file. */
  }
  if (actual !== expected) {
    throw new Error('Contract types are stale. Run npm run generate:contracts and commit the generated file.')
  }
} else {
  writeFileSync(output, expected)
}
