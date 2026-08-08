// Static integrity checks for the agent pack. No TS runtime needed — we read
// the agent sources as text and assert the invariants that keep the pack
// internally consistent (ids match filenames, spawn targets exist, tools are
// real). Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AGENTS_DIR = path.join(ROOT, 'agents')

// Keep in sync with types/agent-definition.ts ToolName union.
const KNOWN_TOOLS = new Set([
  'add_message', 'ask_user', 'code_search', 'end_turn', 'find_files', 'glob',
  'list_directory', 'lookup_agent_info', 'read_docs', 'read_files',
  'run_file_change_hooks', 'run_terminal_command', 'set_messages', 'set_output',
  'skill', 'spawn_agents', 'str_replace', 'suggest_followups', 'task_completed',
  'think_deeply', 'web_search', 'write_file', 'write_todos',
])

const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.ts'))
const idsFromFilenames = new Set(files.map((f) => f.replace(/\.ts$/, '')))

// jsonc parser mirrored from bin/lib.mjs so tests stay dependency-free.
function parseJsonc(text) {
  return JSON.parse(
    text
      .replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m))
      .replace(/,(\s*[}\]])/g, '$1'),
  )
}
const manifest = parseJsonc(fs.readFileSync(path.join(ROOT, 'agents.manifest.json'), 'utf8')).tiers
const models = parseJsonc(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'))

/** Pull a string field like `id: 'x'` from source text. */
function field(src, name) {
  const m = src.match(new RegExp(`\\b${name}:\\s*'([^']+)'`))
  return m ? m[1] : null
}

/** Pull a string-array field like `toolNames: ['a', 'b']`. */
function arrayField(src, name) {
  const m = src.match(new RegExp(`\\b${name}:\\s*\\[([\\s\\S]*?)\\]`))
  if (!m) return null
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('there is a non-trivial number of agents', () => {
  assert.ok(files.length >= 19, `expected >= 19 agents, found ${files.length}`)
})

test('CLI JS entrypoints are syntactically valid', () => {
  for (const rel of ['bin/omf.mjs', 'bin/lib.mjs', 'hooks/notify.mjs']) {
    const res = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' })
    assert.equal(res.status, 0, `${rel} failed --check:\n${res.stderr}`)
  }
})

test('specialists expose a spawnerPrompt for composability', () => {
  for (const file of files) {
    if (file.startsWith('omf-')) continue // orchestrators are user-invoked
    const src = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8')
    assert.match(src, /spawnerPrompt:/, `${file} should define spawnerPrompt`)
  }
})

test('every agent has a tier in the manifest and vice versa', () => {
  for (const id of idsFromFilenames) {
    assert.ok(manifest[id], `agent "${id}" is missing from agents.manifest.json`)
  }
  for (const id of Object.keys(manifest)) {
    assert.ok(idsFromFilenames.has(id), `manifest lists "${id}" but no such agent file exists`)
  }
})

test('models.json presets are complete for every tier', () => {
  const tiers = new Set(models.tiers)
  const usedTiers = new Set(Object.values(manifest))
  for (const t of usedTiers) {
    assert.ok(tiers.has(t), `manifest uses tier "${t}" not declared in models.json tiers`)
  }
  assert.ok(models.presets[models.defaultPreset], 'defaultPreset must exist in presets')
  for (const [name, preset] of Object.entries(models.presets)) {
    for (const t of usedTiers) {
      assert.ok(preset[t], `preset "${name}" is missing tier "${t}"`)
      assert.match(preset[t], /^[\w.-]+\/[\w.:-]+$/, `preset "${name}.${t}" is not a provider/model id`)
    }
  }
})

test('shipped default models match the balanced preset (per tier)', () => {
  const balanced = models.presets.balanced
  for (const file of files) {
    const src = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8')
    const id = src.match(/\bid:\s*'([^']+)'/)[1]
    const model = src.match(/^\s*model:\s*'([^']+)'/m)[1]
    const tier = manifest[id]
    assert.equal(model, balanced[tier], `${file}: default model should equal balanced.${tier}`)
  }
})

for (const file of files) {
  const src = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8')

  test(`${file}: has required fields`, () => {
    assert.ok(field(src, 'id'), 'missing id')
    assert.ok(field(src, 'displayName'), 'missing displayName')
    assert.ok(field(src, 'model'), 'missing model')
    assert.match(src, /export default/, 'missing default export')
  })

  test(`${file}: id matches filename and is well-formed`, () => {
    const id = field(src, 'id')
    assert.equal(id, file.replace(/\.ts$/, ''), 'id must equal the filename')
    assert.match(id, /^[a-z0-9-]+$/, 'id must be lowercase letters, digits, hyphens')
  })

  test(`${file}: toolNames are all known tools`, () => {
    const tools = arrayField(src, 'toolNames') || []
    for (const t of tools) {
      assert.ok(KNOWN_TOOLS.has(t), `unknown tool "${t}" in ${file}`)
    }
  })

  test(`${file}: local spawnableAgents resolve to real agents`, () => {
    const spawnable = arrayField(src, 'spawnableAgents') || []
    for (const s of spawnable) {
      if (s.includes('/')) continue // store-published id, e.g. codebuff/x@0.0.1
      assert.ok(idsFromFilenames.has(s), `${file} spawns unknown local agent "${s}"`)
    }
  })

  test(`${file}: any agent using spawn tools can actually spawn`, () => {
    const tools = arrayField(src, 'toolNames') || []
    const spawnable = arrayField(src, 'spawnableAgents') || []
    if (spawnable.length > 0) {
      assert.ok(
        tools.includes('spawn_agents'),
        `${file} lists spawnableAgents but not the spawn_agents tool`,
      )
    }
  })
}
