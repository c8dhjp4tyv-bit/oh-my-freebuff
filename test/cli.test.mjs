// Unit tests for the CLI helper library (bin/lib.mjs). Real functions, temp
// dirs, no network, no dependencies.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseJsonc, resolveContext, setConfigValue, getConfigValue, loadConfig,
  redactConfig, renderTemplate, resolveSecret, normalizeSkillName, skillDirFor,
  sendNotification,
} from '../bin/lib.mjs'

let tmp
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-cli-'))
})
after(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})
const ctxAt = (dir) => resolveContext({ dir })

test('parseJsonc strips comments and trailing commas but keeps URLs', () => {
  const parsed = parseJsonc(`{
    // line comment
    "a": 1, /* block */
    "b": "http://x/y", // slashes in strings survive
    "c": [1, 2,],
  }`)
  assert.deepEqual(parsed, { a: 1, b: 'http://x/y', c: [1, 2] })
})

test('config set/get roundtrips with dotted keys, scoped to the context dir', () => {
  const ctx = ctxAt(tmp)
  setConfigValue(ctx, 'modelPreset', 'budget')
  setConfigValue(ctx, 'notifications.slack.webhook', 'https://hooks.slack.com/abc')
  assert.equal(getConfigValue(ctx, 'modelPreset'), 'budget')
  assert.equal(getConfigValue(ctx, 'notifications.slack.webhook'), 'https://hooks.slack.com/abc')
  const raw = fs.readFileSync(ctx.configFile, 'utf8')
  assert.equal(parseJsonc(raw).notifications.slack.webhook, 'https://hooks.slack.com/abc')
})

test('config file is written with 0600 permissions', () => {
  const ctx = ctxAt(fs.mkdtempSync(path.join(os.tmpdir(), 'omf-perm-')))
  setConfigValue(ctx, 'notifications.telegram.token', 'secret')
  if (process.platform !== 'win32') {
    const mode = fs.statSync(ctx.configFile).mode & 0o777
    assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`)
  }
})

test('redactConfig masks secret-looking keys, keeps the rest', () => {
  const red = redactConfig({
    modelPreset: 'balanced',
    notifications: {
      slack: { webhook: 'https://hooks.slack.com/x' },
      telegram: { token: 'abc', chatId: '12345' },
      file: './log',
    },
  })
  assert.equal(red.modelPreset, 'balanced')
  assert.equal(red.notifications.slack.webhook, '***redacted***')
  assert.equal(red.notifications.telegram.token, '***redacted***')
  assert.equal(red.notifications.telegram.chatId, '12345') // not a secret
  assert.equal(red.notifications.file, './log')
})

test('normalizeSkillName sluggifies and rejects traversal', () => {
  assert.equal(normalizeSkillName('My Cool Skill'), 'my-cool-skill')
  assert.equal(normalizeSkillName('verify_before/done'.replace('/', '-')), 'verify-before-done')
  for (const bad of ['../etc', 'a/b', 'a\\b', '..', '.', '   ', '/', 'foo/../bar']) {
    assert.throws(() => normalizeSkillName(bad), /invalid|empty/, `should reject ${JSON.stringify(bad)}`)
  }
})

test('skillDirFor keeps the resolved path inside the skills root', () => {
  const ctx = ctxAt(tmp)
  const { dir, file } = skillDirFor(ctx, 'My Skill')
  assert.ok(dir.startsWith(path.resolve(ctx.skillsDir) + path.sep))
  assert.ok(file.endsWith(path.join('my-skill', 'SKILL.md')))
  assert.throws(() => skillDirFor(ctx, '../../../etc/passwd'))
})

test('renderTemplate fills placeholders', () => {
  assert.equal(renderTemplate('hi {{name}} x{{missing}}', { name: 'bob' }), 'hi bob x')
})

test('resolveSecret reads ${VAR} and env: references', () => {
  process.env.OMF_TEST_SECRET = 'shh'
  assert.equal(resolveSecret('${OMF_TEST_SECRET}'), 'shh')
  assert.equal(resolveSecret('env:OMF_TEST_SECRET'), 'shh')
  assert.equal(resolveSecret('literal'), 'literal')
  delete process.env.OMF_TEST_SECRET
})

test('sendNotification writes to the file channel, resolving env-var secrets', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-notify-'))
  const ctx = ctxAt(dir)
  setConfigValue(ctx, 'notifications', { file: './notify.log' })
  const results = await sendNotification('done in {{projectName}}', ctx)
  assert.equal(results.length, 1)
  assert.equal(results[0].channel, 'file')
  assert.equal(results[0].ok, true)
  const logged = fs.readFileSync(path.join(dir, 'notify.log'), 'utf8')
  assert.match(logged, new RegExp(`done in ${path.basename(dir)}`))
})

test('sendNotification returns empty when nothing is configured', async () => {
  const ctx = ctxAt(fs.mkdtempSync(path.join(os.tmpdir(), 'omf-empty-')))
  assert.equal((await sendNotification('x', ctx)).length, 0)
})
