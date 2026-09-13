// End-to-end tests: run the real `omf` CLI as a subprocess against throwaway
// fixture projects. These cover the install/CLI behaviors that unit tests can't
// see — the class of bug that shipped in 0.1.0.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OMF = path.join(ROOT, 'bin', 'omf.mjs')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-e2e-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Run `omf ...args` with `cwd` (defaults to the fixture dir). */
function omf(args, cwd = dir) {
  return spawnSync('node', [OMF, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

test('install places skills at .agents/skills/<name>/SKILL.md (Codebuff-native)', () => {
  assert.equal(omf(['install']).status, 0)
  assert.ok(fs.existsSync(path.join(dir, '.agents', 'skills', 'verify-before-done', 'SKILL.md')))
  // and NOT nested under the pack namespace
  assert.ok(!fs.existsSync(path.join(dir, '.agents', 'oh-my-freebuff', 'skills')))
})

test('install does not overwrite an existing .agents/types/agent-definition.ts', () => {
  const typesFile = path.join(dir, '.agents', 'types', 'agent-definition.ts')
  fs.mkdirSync(path.dirname(typesFile), { recursive: true })
  fs.writeFileSync(typesFile, '// user-or-codebuff-owned sentinel\n')
  assert.equal(omf(['install']).status, 0)
  assert.equal(fs.readFileSync(typesFile, 'utf8'), '// user-or-codebuff-owned sentinel\n')
})

test('install seeds the types shim when none exists', () => {
  assert.equal(omf(['install']).status, 0)
  const typesFile = path.join(dir, '.agents', 'types', 'agent-definition.ts')
  assert.ok(fs.existsSync(typesFile))
  assert.match(fs.readFileSync(typesFile, 'utf8'), /AgentDefinition/)
})

test('skill add/remove roundtrip; traversal is refused and touches nothing outside', () => {
  omf(['install'])
  // a decoy file that a traversal argument might try to reach
  const decoy = path.join(dir, 'README.md')
  fs.writeFileSync(decoy, 'important\n')

  assert.equal(omf(['skill', 'add', 'Temp Skill']).status, 0)
  const created = path.join(dir, '.agents', 'skills', 'temp-skill', 'SKILL.md')
  assert.ok(fs.existsSync(created))

  const bad = omf(['skill', 'remove', '../../README'])
  assert.notEqual(bad.status, 0, 'traversal remove must fail')
  assert.equal(fs.readFileSync(decoy, 'utf8'), 'important\n', 'decoy must be untouched')

  assert.equal(omf(['skill', 'remove', 'temp-skill']).status, 0)
  assert.ok(!fs.existsSync(path.join(dir, '.agents', 'skills', 'temp-skill')))
})

test('--dir operates only on the target project, not the working directory', () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-cwd-'))
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-target-'))
  try {
    const res = omf(['setup', '--dir', target], workdir)
    assert.equal(res.status, 0, res.stderr)
    // everything lands in the target
    assert.ok(fs.existsSync(path.join(target, '.agents', 'oh-my-freebuff')))
    assert.ok(fs.existsSync(path.join(target, '.freebuff', 'omf.jsonc')))
    assert.ok(fs.existsSync(path.join(target, 'knowledge.md')))
    // and nothing leaks into the working directory
    assert.ok(!fs.existsSync(path.join(workdir, '.agents')))
    assert.ok(!fs.existsSync(path.join(workdir, '.freebuff')))
    assert.ok(!fs.existsSync(path.join(workdir, 'knowledge.md')))
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true })
    fs.rmSync(target, { recursive: true, force: true })
  }
})

test('preset rewrites installed agents and records the choice in config', () => {
  omf(['install'])
  assert.equal(omf(['preset', 'premium']).status, 0)
  // omf-team is a strong-tier agent; assert it took the premium 'strong' model
  // (read from models.json so this test tracks the preset, not a hard-coded id).
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'))
  const team = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'omf-team.ts'), 'utf8')
  assert.ok(team.includes(`model: '${models.presets.premium.strong}'`), `omf-team should use premium.strong (${models.presets.premium.strong})`)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.freebuff', 'omf.jsonc'), 'utf8'))
  assert.equal(cfg.modelPreset, 'premium')
})

test('config output redacts secrets by default and reveals with --show-secrets', () => {
  omf(['install'])
  omf(['notify', 'setup', 'slack', 'https://hooks.slack.com/services/T/B/xyz'])
  const hidden = omf(['config'])
  assert.doesNotMatch(hidden.stdout, /hooks\.slack\.com/)
  assert.match(hidden.stdout, /redacted/)
  const shown = omf(['config', '--show-secrets'])
  assert.match(shown.stdout, /hooks\.slack\.com/)
})

test('config get on a secret key is redacted unless --show-secrets', () => {
  omf(['install'])
  omf(['notify', 'setup', 'telegram', 'BOT-TOKEN-123', '99999'])
  const got = omf(['config', 'get', 'notifications.telegram.token'])
  assert.doesNotMatch(got.stdout, /BOT-TOKEN-123/)
  assert.match(got.stdout, /redacted/)
  // non-secret sibling is still readable
  assert.match(omf(['config', 'get', 'notifications.telegram.chatId']).stdout, /99999/)
  // and the real value is available on demand
  assert.match(omf(['config', 'get', 'notifications.telegram.token', '--show-secrets']).stdout, /BOT-TOKEN-123/)
})

test('notify setup rejects a literal Slack/Discord webhook on an arbitrary host', () => {
  const badSlack = omf(['notify', 'setup', 'slack', 'https://example.com/services/T/B/X'])
  assert.notEqual(badSlack.status, 0)
  assert.match(badSlack.stderr, /slack webhook/)

  const badDiscord = omf(['notify', 'setup', 'discord', 'http://discord.com/api/webhooks/1/x'])
  assert.notEqual(badDiscord.status, 0)
  assert.match(badDiscord.stderr, /https/)
})

test('uninstall does NOT delete a user-owned skill with a shipped name', () => {
  // user has their own verify-before-done BEFORE installing
  const userSkill = path.join(dir, '.agents', 'skills', 'verify-before-done', 'SKILL.md')
  fs.mkdirSync(path.dirname(userSkill), { recursive: true })
  fs.writeFileSync(userSkill, '---\nname: verify-before-done\n---\nMINE\n')

  omf(['install']) // must not clobber it
  assert.match(fs.readFileSync(userSkill, 'utf8'), /MINE/)

  omf(['uninstall']) // must not delete it
  assert.ok(fs.existsSync(userSkill), 'user-owned skill must survive uninstall')
  assert.match(fs.readFileSync(userSkill, 'utf8'), /MINE/)
})

test('update does NOT overwrite a shipped skill the user modified', () => {
  omf(['install'])
  const skill = path.join(dir, '.agents', 'skills', 'verify-before-done', 'SKILL.md')
  fs.writeFileSync(skill, '---\nname: verify-before-done\n---\nEDITED BY USER\n')
  omf(['update'])
  assert.match(fs.readFileSync(skill, 'utf8'), /EDITED BY USER/)
})

test('--dir with no path fails fast instead of using the cwd', () => {
  const res = omf(['install', '--dir'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /--dir requires a path/)
})

test('modelOverrides pin an agent and survive update', () => {
  omf(['install'])
  omf(['config', 'set', 'modelOverrides.implementer', 'test/pinned-model'])
  omf(['update'])
  const impl = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'implementer.ts'), 'utf8')
  assert.match(impl, /model:\s*'test\/pinned-model'/)
})

test('customPresets inherit the default preset for omitted tiers', () => {
  omf(['install'])
  const cfgDir = path.join(dir, '.freebuff')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'omf.jsonc'),
    JSON.stringify({ customPresets: { mine: { description: 'partial override', strong: 'test/strong-x' } } }, null, 2),
  )
  const res = omf(['preset', 'mine'])
  assert.equal(res.status, 0, res.stderr)
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'))
  const team = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'omf-team.ts'), 'utf8')
  const impl = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'implementer.ts'), 'utf8')
  assert.match(team, /model:\s*'test\/strong-x'/)
  assert.ok(impl.includes(`model: '${models.presets.balanced.coding}'`), 'omitted coding tier should inherit balanced.coding')
})

test('a custom balanced preset is applied during install even without an explicit modelPreset', () => {
  const cfgDir = path.join(dir, '.freebuff')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'omf.jsonc'),
    JSON.stringify({ customPresets: { balanced: { strong: 'test/refined-balanced-strong' } } }, null, 2),
  )
  const res = omf(['install'])
  assert.equal(res.status, 0, res.stderr)
  const team = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'omf-team.ts'), 'utf8')
  assert.match(team, /model:\s*'test\/refined-balanced-strong'/)
})

test('customPresets can explicitly extend another preset', () => {
  omf(['install'])
  const cfgDir = path.join(dir, '.freebuff')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'omf.jsonc'),
    JSON.stringify({ customPresets: { mine: { extends: 'premium', strong: 'test/strong-x' } } }, null, 2),
  )
  assert.equal(omf(['preset', 'mine']).status, 0)
  const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'))
  const picker = fs.readFileSync(path.join(dir, '.agents', 'oh-my-freebuff', 'file-picker.ts'), 'utf8')
  assert.ok(picker.includes(`model: '${models.presets.premium.fast}'`), 'explicit extends should inherit premium.fast')
})

test('broken routing config fails update before replacing the working pack', () => {
  assert.equal(omf(['install']).status, 0)
  const pack = path.join(dir, '.agents', 'oh-my-freebuff')
  const marker = path.join(pack, 'working-install-marker.txt')
  fs.writeFileSync(marker, 'keep me\n')

  const cfgDir = path.join(dir, '.freebuff')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'omf.jsonc'),
    JSON.stringify({ modelPreset: 'broken', customPresets: { broken: { extends: 'does-not-exist' } } }, null, 2),
  )
  const res = omf(['update'])
  assert.notEqual(res.status, 0)
  assert.match(res.stderr, /unknown preset/)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'keep me\n', 'old working pack must survive a failed staged update')
})

test('unknown modelOverrides are rejected instead of silently doing nothing', () => {
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
  assert.match(res.stderr, /missing\/empty\/non-string model id/)
  assert.equal(fs.readFileSync(architectFile, 'utf8'), architectBefore)
  assert.equal(fs.readFileSync(reviewerFile, 'utf8'), reviewerBefore)
})

test('doctor flags an unknown configured preset', () => {
  omf(['install'])
  omf(['config', 'set', 'modelPreset', 'patates'])
  const d = omf(['doctor'])
  assert.match(d.stdout, /not a known preset/)
})

test('doctor reports malformed config instead of silently treating it as empty', () => {
  omf(['install'])
  const cfg = path.join(dir, '.freebuff', 'omf.jsonc')
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, '{ broken')
  const d = omf(['doctor'])
  assert.notEqual(d.status, 0)
  assert.match(d.stdout, /config files parse/)
  assert.match(d.stdout, /not valid JSONC/)
})

test('uninstall removes an unmodified shipped skill it installed', () => {
  omf(['install'])
  const skillDir = path.join(dir, '.agents', 'skills', 'verify-before-done')
  assert.ok(fs.existsSync(skillDir))
  omf(['uninstall'])
  assert.ok(!fs.existsSync(skillDir), 'unmodified shipped skill should be removed')
})
