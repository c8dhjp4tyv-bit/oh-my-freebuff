// Static integrity checks for the agent pack. No TS runtime needed — we read
// the agent sources as text and assert the invariants that keep the pack
// internally consistent (ids match filenames, spawn targets exist, tools are
// real). Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
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
  assert.ok(files.length >= 8, `expected >= 8 agents, found ${files.length}`)
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
