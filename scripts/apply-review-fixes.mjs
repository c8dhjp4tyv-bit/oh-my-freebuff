import fs from 'node:fs'
import path from 'node:path'

function replace(file, oldText, newText) {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes(oldText)) throw new Error(`expected block not found in ${file}`)
  fs.writeFileSync(file, text.replace(oldText, newText))
}

replace('bin/omf.mjs', `  const unknownOverrides = Object.keys(overrides).filter((id) => !manifest[id])
  if (unknownOverrides.length) throw new Error(\`modelOverrides reference unknown agent(s): \${unknownOverrides.join(', ')}\`)

  let changed = 0
  let overridden = 0
  for (const file of fs.readdirSync(targetDir).filter((f) => f.endsWith('.ts'))) {
    const filePath = path.join(targetDir, file)
    const src = fs.readFileSync(filePath, 'utf8')
    const idMatch = src.match(/\\bid:\\s*'([^']+)'/)
    if (!idMatch) continue
    const id = idMatch[1]
    const usingOverride = Object.prototype.hasOwnProperty.call(overrides, id)
    const model = usingOverride ? overrides[id] : preset[manifest[id]]
    if (!model || typeof model !== 'string') throw new Error(\`no model resolved for agent "\${id}"\`)
    const next = src.replace(/^(\\s*model:\\s*)'[^']*'/m, \`$1'\${model}'\`)
    if (next !== src) {
      fs.writeFileSync(filePath, next)
      changed++
      if (usingOverride) overridden++
    }
  }
  return { models, preset, changed, overridden }
`, `  const unknownOverrides = Object.keys(overrides).filter((id) => !manifest[id])
  if (unknownOverrides.length) throw new Error(\`modelOverrides reference unknown agent(s): \${unknownOverrides.join(', ')}\`)
  const invalidOverrides = Object.entries(overrides)
    .filter(([, model]) => typeof model !== 'string' || model.trim().length === 0)
    .map(([id]) => id)
  if (invalidOverrides.length) {
    throw new Error(\`modelOverrides contain missing/empty/non-string model id(s): \${invalidOverrides.join(', ')}\`)
  }

  // Build the complete edit plan before the first write. If any model is invalid,
  // fail with the installed pack untouched instead of leaving a mixed preset.
  const edits = []
  let overridden = 0
  for (const file of fs.readdirSync(targetDir).filter((f) => f.endsWith('.ts'))) {
    const filePath = path.join(targetDir, file)
    const src = fs.readFileSync(filePath, 'utf8')
    const idMatch = src.match(/\\bid:\\s*'([^']+)'/)
    if (!idMatch) continue
    const id = idMatch[1]
    const usingOverride = Object.prototype.hasOwnProperty.call(overrides, id)
    const model = usingOverride ? overrides[id] : preset[manifest[id]]
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new Error(\`no valid model resolved for agent "\${id}"\`)
    }
    const next = src.replace(/^(\\s*model:\\s*)'[^']*'/m, \`$1'\${model}'\`)
    if (next !== src) {
      edits.push({ filePath, next })
      if (usingOverride) overridden++
    }
  }
  for (const { filePath, next } of edits) fs.writeFileSync(filePath, next)
  return { models, preset, changed: edits.length, overridden }
`)

replace('test/e2e.test.mjs', `test('unknown modelOverrides are rejected instead of silently doing nothing', () => {
  omf(['install'])
  omf(['config', 'set', 'modelOverrides.not-a-real-agent', 'test/model'])
  const res = omf(['update'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /unknown agent/)
})
`, `test('unknown modelOverrides are rejected instead of silently doing nothing', () => {
  omf(['install'])
  omf(['config', 'set', 'modelOverrides.not-a-real-agent', 'test/model'])
  const res = omf(['update'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /unknown agent/)
})

test('invalid model override cannot partially rewrite an installed preset', () => {
  omf(['install'])
  const pack = path.join(dir, '.agents', 'oh-my-freebuff')
  const architectFile = path.join(pack, 'architect.ts')
  const reviewerFile = path.join(pack, 'reviewer.ts')
  const architectBefore = fs.readFileSync(architectFile, 'utf8')
  const reviewerBefore = fs.readFileSync(reviewerFile, 'utf8')
  const cfgDir = path.join(dir, '.freebuff')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'omf.jsonc'),
    JSON.stringify({ modelOverrides: { architect: 'test/valid-model', reviewer: '' } }, null, 2),
  )
  const res = omf(['preset', 'premium'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /missing\\/empty\\/non-string model id/)
  assert.equal(fs.readFileSync(architectFile, 'utf8'), architectBefore)
  assert.equal(fs.readFileSync(reviewerFile, 'utf8'), reviewerBefore)
})
`)

replace('README.md', `| \`omf-ralph\` | Loop on one check command until it passes. Won't report green on a red check. |
`, `| \`omf-ralph\` | Loop on one check command. With \`verifyCommand\`, the harness machine-enforces exit 0 before success. |
`)
replace('README.md', `\`omf-ralph\`, \`omf-ultraqa\`, and \`omf-pipeline\` also use programmatic
\`handleSteps\` logic for guarantees that should not depend only on prompt
obedience. Ralph and UltraQA re-run real commands before allowing success;
Pipeline enforces its coarse stage order and can enforce a final command.
`, `\`omf-ralph\`, \`omf-ultraqa\`, and \`omf-pipeline\` also use programmatic
\`handleSteps\` logic for guarantees that should not depend only on prompt
obedience. Ralph re-runs a real command before allowing success when
\`verifyCommand\` is supplied; UltraQA does the same for \`gateCommands\`. Without
those explicit parameters, their discovered-check loops remain prompt-driven.
Pipeline always enforces its coarse stage order and can optionally enforce a
final \`verifyCommand\`.
`)

fs.writeFileSync('.github/workflows/ci.yml', `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22, 24]
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  codebuff-compat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: test/fixtures/codebuff-sdk-0.10.7/package-lock.json
      - run: npm ci --prefix test/fixtures/codebuff-sdk-0.10.7
      - name: Smoke-test pinned Codebuff SDK graph
        run: npm run smoke
        env:
          OMF_CODEBUFF_SDK_ROOT: \${{ github.workspace }}/test/fixtures/codebuff-sdk-0.10.7
`)

fs.writeFileSync('.github/workflows/codebuff-canary.yml', `name: Codebuff SDK canary

on:
  schedule:
    - cron: '17 6 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  latest-sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Install latest Codebuff SDK
        run: npm i --no-save @codebuff/sdk@latest
      - name: Smoke-test latest SDK
        run: npm run smoke
`)

const fixture = 'test/fixtures/codebuff-sdk-0.10.7'
fs.mkdirSync(fixture, { recursive: true })
fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
  name: 'oh-my-freebuff-codebuff-sdk-0.10.7-smoke',
  private: true,
  version: '1.0.0',
  dependencies: { '@codebuff/sdk': '0.10.7' },
}, null, 2) + '\n')

const smokeFile = 'test/smoke-codebuff.mjs'
let smoke = fs.readFileSync(smokeFile, 'utf8')
smoke = smoke.replace("import { fileURLToPath } from 'node:url'", "import { fileURLToPath, pathToFileURL } from 'node:url'\nimport { createRequire } from 'node:module'")
smoke = smoke.replace(`let sdk = null
try {
  sdk = await import('@codebuff/sdk')
} catch {`, `const sdkRoot = process.env.OMF_CODEBUFF_SDK_ROOT
  ? path.resolve(process.env.OMF_CODEBUFF_SDK_ROOT)
  : ROOT
const sdkRequire = createRequire(path.join(sdkRoot, 'package.json'))
let sdk = null
let sdkEntry = null
try {
  sdkEntry = sdkRequire.resolve('@codebuff/sdk')
  sdk = await import(pathToFileURL(sdkEntry).href)
} catch {`)
smoke = smoke.replace("const dts = path.join(ROOT, 'node_modules', '@codebuff', 'sdk', 'dist', 'index.d.ts')", "const dts = path.join(path.dirname(sdkEntry), 'index.d.ts')")
fs.writeFileSync(smokeFile, smoke)
