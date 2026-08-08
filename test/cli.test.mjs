// Behavioral tests for the CLI helper library (bin/lib.mjs). Runs the real
// functions against a temp working directory. No network, no dependencies.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseJsonc, setConfigValue, getConfigValue, loadConfig, renderTemplate,
  sendNotification,
} from '../bin/lib.mjs'

let tmp
let origCwd
before(() => {
  origCwd = process.cwd()
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-cli-'))
  process.chdir(tmp)
})
after(() => {
  process.chdir(origCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('parseJsonc strips comments and trailing commas', () => {
  const parsed = parseJsonc(`{
    // a line comment
    "a": 1, /* block */
    "b": "http://x/y", // url with slashes must survive
    "c": [1, 2,],
  }`)
  assert.deepEqual(parsed, { a: 1, b: 'http://x/y', c: [1, 2] })
})

test('config set/get roundtrips with dotted keys', () => {
  setConfigValue('project', 'modelPreset', 'budget')
  setConfigValue('project', 'notifications.slack.webhook', 'https://hooks.slack.com/abc')
  assert.equal(getConfigValue('modelPreset'), 'budget')
  assert.equal(getConfigValue('notifications.slack.webhook'), 'https://hooks.slack.com/abc')
  // written file is valid jsonc/json
  const raw = fs.readFileSync(path.join(tmp, '.freebuff', 'omf.jsonc'), 'utf8')
  assert.equal(parseJsonc(raw).notifications.slack.webhook, 'https://hooks.slack.com/abc')
})

test('config set coerces booleans and numbers', () => {
  setConfigValue('project', 'flags.enabled', 'true')
  setConfigValue('project', 'flags.count', '3')
  assert.equal(getConfigValue('flags.enabled'), true)
  assert.equal(getConfigValue('flags.count'), 3)
})

test('renderTemplate fills placeholders', () => {
  assert.equal(renderTemplate('hi {{name}} x{{missing}}', { name: 'bob' }), 'hi bob x')
})

test('sendNotification writes to the file channel', async () => {
  // Reset notifications to ONLY the file channel (avoid any network channel
  // left over from earlier tests).
  setConfigValue('project', 'notifications', { file: './notify.log' })
  const results = await sendNotification('done in {{projectName}}')
  assert.equal(results.length, 1)
  assert.equal(results[0].channel, 'file')
  assert.equal(results[0].ok, true)
  const logged = fs.readFileSync(path.join(tmp, 'notify.log'), 'utf8')
  assert.match(logged, new RegExp(`done in ${path.basename(tmp)}`))
})

test('sendNotification returns empty when nothing configured', async () => {
  // fresh temp with no config
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'omf-empty-'))
  const prev = process.cwd()
  process.chdir(t2)
  try {
    const results = await sendNotification('x')
    assert.equal(results.length, 0)
  } finally {
    process.chdir(prev)
    fs.rmSync(t2, { recursive: true, force: true })
  }
})
