// Shared helpers for the omf CLI. Zero runtime dependencies.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

// ---- colors -----------------------------------------------------------------

export const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
}
const useColor = process.stdout.isTTY && !process.env.NO_COLOR
export const paint = (color, s) => (useColor ? color + s + c.reset : s)

// ---- jsonc ------------------------------------------------------------------

/** Strip // and block comments and trailing commas, then JSON.parse. */
export function parseJsonc(text) {
  const noComments = text
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m))
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

export const PACK_NAME = 'oh-my-freebuff'
export const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'freebuff-omf')
export const USER_CONFIG = path.join(USER_CONFIG_DIR, 'config.jsonc')

// ---- project context --------------------------------------------------------

/**
 * Resolve the single source of truth for where a command operates. Every path a
 * command touches (agents, skills, config, knowledge, notifications) derives
 * from here, so `--dir` and `--global` behave consistently.
 *
 *   default   → the current directory
 *   --global  → the home directory; config lives in the user-scope file
 *   --dir X   → the directory X (its own .agents and .freebuff)
 */
export function resolveContext(opts = {}) {
  const scope = opts.global ? 'global' : 'project'
  const root = opts.dir
    ? path.resolve(process.cwd(), opts.dir)
    : opts.global
      ? os.homedir()
      : process.cwd()
  const agentsDir = path.join(root, '.agents')
  const configFile = scope === 'global' ? USER_CONFIG : path.join(root, '.freebuff', 'omf.jsonc')
  return {
    scope,
    root,
    agentsDir,
    packDir: path.join(agentsDir, PACK_NAME),
    typesFile: path.join(agentsDir, 'types', 'agent-definition.ts'),
    skillsDir: path.join(agentsDir, 'skills'),
    configFile,
    configDir: path.dirname(configFile),
    projectName: path.basename(root) || 'project',
  }
}

// ---- config -----------------------------------------------------------------

/** Merge user config under the context's own config (project overrides user). */
export function loadConfig(ctx) {
  const user = readJsoncSafe(USER_CONFIG, {})
  if (ctx.scope === 'global') return { ...user, _sources: { user: USER_CONFIG } }
  const project = readJsoncSafe(ctx.configFile, {})
  return { ...user, ...project, _sources: { user: USER_CONFIG, project: ctx.configFile } }
}

/** Set a dotted key in the context's config file. Secrets get 0600. */
export function setConfigValue(ctx, dottedKey, value) {
  fs.mkdirSync(ctx.configDir, { recursive: true })
  const cfg = readJsoncSafe(ctx.configFile, {})
  const parts = dottedKey.split('.')
  let node = cfg
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {}
    node = node[parts[i]]
  }
  node[parts[parts.length - 1]] = coerce(value)
  fs.writeFileSync(ctx.configFile, JSON.stringify(cfg, null, 2) + '\n')
  try {
    fs.chmodSync(ctx.configFile, 0o600) // config can hold tokens/webhooks
  } catch {
    /* best effort; no-op on platforms without POSIX modes */
  }
  return ctx.configFile
}

export function getConfigValue(ctx, dottedKey) {
  const cfg = loadConfig(ctx)
  return dottedKey.split('.').reduce((n, k) => (n == null ? n : n[k]), cfg)
}

function coerce(v) {
  if (typeof v !== 'string') return v
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !isNaN(Number(v))) return Number(v)
  return v
}

const SECRET_KEY = /token|secret|webhook|password|passwd|api[_-]?key|(^|_)key$/i

/** Deep copy of a config object with secret-looking values masked. */
export function redactConfig(obj) {
  if (Array.isArray(obj)) return obj.map(redactConfig)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_sources') continue
      out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? '***redacted***' : redactConfig(v)
    }
    return out
  }
  return obj
}

// ---- skill names (path-traversal safe) --------------------------------------

/**
 * Validate and normalize a skill name into a safe single-segment slug.
 * Rejects anything with path separators, `..`, or that empties out. This is the
 * one gate every skill-mutating command must pass user input through.
 */
export function normalizeSkillName(raw) {
  const input = String(raw ?? '').trim()
  if (!input) throw new Error('skill name is empty')
  if (/[\\/]/.test(input) || input.includes('..')) {
    throw new Error(`invalid skill name "${raw}" (no slashes or "..")`)
  }
  const slug = input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug || slug === '.' || slug === '..') throw new Error(`invalid skill name "${raw}"`)
  return slug
}

/** Resolve a skill directory and assert it stays inside the skills root. */
export function skillDirFor(ctx, rawName) {
  const slug = normalizeSkillName(rawName)
  const root = path.resolve(ctx.skillsDir)
  const dir = path.resolve(root, slug)
  const rel = path.relative(root, dir)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing path outside skills directory: ${rawName}`)
  }
  return { slug, dir, file: path.join(dir, 'SKILL.md') }
}

// ---- git ignore check -------------------------------------------------------

/** True if `relPath` is git-ignored within `root`. null if not a git repo. */
export function isGitIgnored(root, relPath) {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
  } catch {
    return null
  }
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '-q', relPath], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// ---- notifications ----------------------------------------------------------

export function renderTemplate(tmpl, vars) {
  return String(tmpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

/** Resolve `${VAR}` or `env:VAR` secret references from the environment. */
export function resolveSecret(v) {
  if (typeof v !== 'string') return v
  let m = v.match(/^\$\{(\w+)\}$/) || v.match(/^env:(\w+)$/)
  return m ? process.env[m[1]] || '' : v
}

/**
 * Send `message` to every configured notification channel. Returns
 * [{ channel, ok, detail }]. Reads config from the given context.
 */
export async function sendNotification(message, ctx, vars = {}) {
  const n = (loadConfig(ctx).notifications) || {}
  const text = renderTemplate(message, { projectName: ctx.projectName, ...vars })
  const results = []

  if (n.file) {
    try {
      const target = path.resolve(ctx.root, resolveSecret(n.file))
      fs.appendFileSync(target, `[${new Date().toISOString()}] ${text}\n`)
      results.push({ channel: 'file', ok: true, detail: n.file })
    } catch (e) {
      results.push({ channel: 'file', ok: false, detail: e.message })
    }
  }

  const tgToken = resolveSecret(n.telegram?.token)
  const tgChat = resolveSecret(n.telegram?.chatId)
  if (tgToken && tgChat) {
    results.push(await post('telegram', `https://api.telegram.org/bot${tgToken}/sendMessage`, { chat_id: tgChat, text }))
  }
  const discord = resolveSecret(n.discord?.webhook)
  if (discord) results.push(await post('discord', discord, { content: text }))
  const slack = resolveSecret(n.slack?.webhook)
  if (slack) results.push(await post('slack', slack, { text }))

  return results
}

async function post(channel, url, body) {
  try {
    if (typeof fetch !== 'function') return { channel, ok: false, detail: 'fetch unavailable (need Node >= 18)' }
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
    return JSON.parse(fs.readFileSync(path.join(packRoot, 'package.json'), 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

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
