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

test('Codebuff loadLocalAgents discovers the installed pack agents', skipIfNoSdk, async () => {
  const dir = freshInstall()
  try {
    const agents = await sdk.loadLocalAgents({ agentsPath: path.join(dir, '.agents', 'oh-my-freebuff'), validate: true })
    const ids = new Set(Object.values(agents).map((a) => a.id))
    for (const expected of ['omf-team', 'implementer', 'reviewer', 'omf-ralph']) {
      assert.ok(ids.has(expected), `Codebuff should load agent "${expected}" (loaded: ${[...ids].join(', ')})`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
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
