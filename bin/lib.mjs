// Shared helpers for the omf CLI. Zero runtime dependencies.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---- colors -----------------------------------------------------------------

export const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
}
const useColor = process.stdout.isTTY && !process.env.NO_COLOR
export const paint = (color, s) => (useColor ? color + s + c.reset : s)

// ---- jsonc ------------------------------------------------------------------

/** Strip // and /* *\/ comments and trailing commas, then JSON.parse. */
export function parseJsonc(text) {
  const noComments = text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/g, (m, g) =>
      g ? '' : m,
    )
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(noComments)
}

export function readJsonc(file) {
  return parseJsonc(fs.readFileSync(file, 'utf8'))
}

export function readJsoncSafe(file, fallback = {}) {
  try {
    return readJsonc(file)
  } catch {
    return fallback
  }
}

// ---- paths ------------------------------------------------------------------

export const PROJECT_CONFIG_DIR = () => path.join(process.cwd(), '.freebuff')
export const PROJECT_CONFIG = () => path.join(PROJECT_CONFIG_DIR(), 'omf.jsonc')
export const USER_CONFIG_DIR = () =>
  path.join(os.homedir(), '.config', 'freebuff-omf')
export const USER_CONFIG = () => path.join(USER_CONFIG_DIR(), 'config.jsonc')

/** Resolve the target .agents directory from CLI options. */
export function resolveAgentsDir(opts = {}) {
  if (opts.dir) return path.resolve(process.cwd(), opts.dir, '.agents')
  const base = opts.global ? os.homedir() : process.cwd()
  return path.join(base, '.agents')
}

export const PACK_NAME = 'oh-my-freebuff'
export const installedPackDir = (opts) =>
  path.join(resolveAgentsDir(opts), PACK_NAME)

// ---- config (merged user < project) ----------------------------------------

export function loadConfig() {
  const user = readJsoncSafe(USER_CONFIG(), {})
  const project = readJsoncSafe(PROJECT_CONFIG(), {})
  return { ...user, ...project, _user: user, _project: project }
}

/** Set a dotted key (e.g. "notifications.telegram.token") in a config scope. */
export function setConfigValue(scope, dottedKey, value) {
  const file = scope === 'global' ? USER_CONFIG() : PROJECT_CONFIG()
  const dir = scope === 'global' ? USER_CONFIG_DIR() : PROJECT_CONFIG_DIR()
  fs.mkdirSync(dir, { recursive: true })
  const cfg = readJsoncSafe(file, {})
  const parts = dottedKey.split('.')
  let node = cfg
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null)
      node[parts[i]] = {}
    node = node[parts[i]]
  }
  node[parts[parts.length - 1]] = coerce(value)
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
  return file
}

export function getConfigValue(dottedKey) {
  const cfg = loadConfig()
  return dottedKey.split('.').reduce((n, k) => (n == null ? n : n[k]), cfg)
}

function coerce(v) {
  if (typeof v !== 'string') return v
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !isNaN(Number(v))) return Number(v)
  return v
}

// ---- notifications ----------------------------------------------------------

/** Fill {{var}} placeholders from a context object. */
export function renderTemplate(tmpl, ctx) {
  return String(tmpl).replace(/\{\{(\w+)\}\}/g, (_, k) =>
    ctx[k] != null ? String(ctx[k]) : '',
  )
}

/**
 * Send `message` to every configured notification channel.
 * Returns an array of { channel, ok, detail }.
 * config.notifications shape:
 *   { file: "path", telegram: {token, chatId}, discord: {webhook}, slack: {webhook} }
 */
export async function sendNotification(message, ctx = {}) {
  const cfg = loadConfig()
  const n = cfg.notifications || {}
  const text = renderTemplate(message, {
    projectName: path.basename(process.cwd()),
    ...ctx,
  })
  const results = []

  if (n.file) {
    try {
      fs.appendFileSync(
        path.resolve(process.cwd(), n.file),
        `[${new Date().toISOString()}] ${text}\n`,
      )
      results.push({ channel: 'file', ok: true, detail: n.file })
    } catch (e) {
      results.push({ channel: 'file', ok: false, detail: e.message })
    }
  }

  if (n.telegram?.token && n.telegram?.chatId) {
    results.push(
      await post('telegram',
        `https://api.telegram.org/bot${n.telegram.token}/sendMessage`,
        { chat_id: n.telegram.chatId, text }),
    )
  }

  if (n.discord?.webhook) {
    results.push(await post('discord', n.discord.webhook, { content: text }))
  }

  if (n.slack?.webhook) {
    results.push(await post('slack', n.slack.webhook, { text }))
  }

  return results
}

async function post(channel, url, body) {
  try {
    if (typeof fetch !== 'function') {
      return { channel, ok: false, detail: 'fetch unavailable (need Node >= 18)' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { channel, ok: res.ok, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { channel, ok: false, detail: e.message }
  }
}

// ---- misc -------------------------------------------------------------------

export function readPackVersion(packRoot) {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(packRoot, 'package.json'), 'utf8'))
        .version || '0.0.0'
    )
  } catch {
    return '0.0.0'
  }
}

/** Find an executable on PATH. */
export function which(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter)
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const d of dirs)
    for (const ext of exts) {
      const p = path.join(d, bin + ext)
      try {
        fs.accessSync(p, fs.constants.X_OK)
        return p
      } catch {
        /* keep looking */
      }
    }
  return null
}
