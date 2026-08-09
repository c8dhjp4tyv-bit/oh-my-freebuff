// Runtime smoke test against the REAL Codebuff SDK. This is the one test that
// checks our agents and skills actually load through Codebuff's own loaders,
// rather than just matching our own invariants.
//
// It is opt-in because it needs @codebuff/sdk (large, not a default dependency):
//
//   npm i --no-save @codebuff/sdk
//   npm run smoke
//
// If the SDK isn't present the whole suite skips cleanly — no network, no API
// key required (we only exercise the local loaders, not model calls).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OMF = path.join(ROOT, 'bin', 'omf.mjs')

let sdk = null
try {
  sdk = await import('@codebuff/sdk')
} catch {
  /* not installed — tests below skip */
}
const skipIfNoSdk = { skip: sdk ? false : '@codebuff/sdk not installed (run: npm i --no-save @codebuff/sdk)' }

function freshInstall() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-smoke-'))
  const res = spawnSync('node', [OMF, 'install', '--dir', dir], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })
  assert.equal(res.status, 0, res.stderr)
  return dir
}

test('Codebuff loadLocalAgents loads every pack agent with no validation errors', skipIfNoSdk, async () => {
  const dir = freshInstall()
  try {
    // With validate:true the SDK returns { agents, validationErrors }.
    const { agents, validationErrors } = await sdk.loadLocalAgents({
      agentsPath: path.join(dir, '.agents', 'oh-my-freebuff'),
      validate: true,
    })
    assert.deepEqual(validationErrors, [], `Codebuff reported validation errors: ${JSON.stringify(validationErrors)}`)
    const ids = new Set(Object.values(agents).map((a) => a.id))
    for (const expected of ['omf-team', 'implementer', 'reviewer', 'omf-ralph', 'advisor-a']) {
      assert.ok(ids.has(expected), `Codebuff should load agent "${expected}" (loaded: ${[...ids].sort().join(', ')})`)
    }
    assert.equal(ids.size, 26, `expected 26 agents, Codebuff loaded ${ids.size}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('installed pack dir has no non-agent files that break the loader', skipIfNoSdk, async () => {
  const dir = freshInstall()
  try {
    // A clean load (validate:false) should surface no per-file load errors for
    // the pack dir — i.e. we don't ship .mjs/hook/type files the loader chokes on.
    const errs = []
    const orig = console.error
    console.error = (...a) => errs.push(a.join(' '))
    try {
      await sdk.loadLocalAgents({ agentsPath: path.join(dir, '.agents', 'oh-my-freebuff') })
    } finally {
      console.error = orig
    }
    const loadErrors = errs.filter((e) => /Error loading agent/i.test(e))
    assert.deepEqual(loadErrors, [], `loader errors: ${loadErrors.join('\n')}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('every model id in models.json is one the SDK recognizes', skipIfNoSdk, async () => {
  // ModelName in the SDK is `<enumerated literals> | (string & {})`, so the type
  // accepts anything — but the enumerated literals are the models Codebuff/
  // OpenRouter actually know. Extract them and assert our presets only use those,
  // so a stale/typo'd slug fails CI here instead of at a user's terminal.
  const dts = path.join(ROOT, 'node_modules', '@codebuff', 'sdk', 'dist', 'index.d.ts')
  const known = new Set([...fs.readFileSync(dts, 'utf8').matchAll(/"([a-z0-9-]+\/[a-z0-9.:@-]+)"/g)].map((m) => m[1]))
  assert.ok(known.size > 20, 'failed to parse SDK model list')
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'))
  const used = new Set()
  for (const preset of Object.values(models.presets)) {
    for (const t of models.tiers) if (preset[t]) used.add(preset[t])
  }
  const unknown = [...used].filter((id) => !known.has(id))
  assert.deepEqual(unknown, [], `models.json uses ids the SDK doesn't list: ${unknown.join(', ')}`)
})

test('Codebuff loadSkills discovers the installed skill', skipIfNoSdk, async () => {
  const dir = freshInstall()
  try {
    const loader = sdk.loadSkills || sdk.default?.loadSkills
    assert.ok(typeof loader === 'function', 'SDK should export loadSkills')
    const skills = await loader({ cwd: dir })
    assert.ok(skills['verify-before-done'], `expected verify-before-done in skills (got: ${Object.keys(skills).join(', ')})`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
