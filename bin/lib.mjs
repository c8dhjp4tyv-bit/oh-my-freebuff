// Shared helpers for the omf CLI. Zero runtime dependencies.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
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

/** Lenient read for display paths: any error (missing, malformed) → fallback. */
export function readJsoncSafe(file, fallback = {}) {
  try {
    return readJsonc(file)
  } catch {
    return fallback
  }
}

/**
 * Strict read for WRITE paths: a missing file is fine (returns {}), but a
 * malformed or unreadable file throws so we never silently overwrite a config
 * the user meant to keep.
 */
export function readJsoncForWrite(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    throw new Error(`cannot read ${file}: ${e.message}`)
  }
  try {
    return parseJsonc(text)
  } catch (e) {
    throw new Error(
      `${file} is not valid JSONC (${e.message}). Refusing to overwrite it — fix or remove the file first.`,
    )
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

const FORBIDDEN_KEY = new Set(['__proto__', 'prototype', 'constructor'])

/**
 * Set a dotted key in the context's config file.
 * - Aborts if the existing file is malformed (no silent data loss).
 * - Rejects prototype-polluting key segments.
 * - Writes atomically with 0600 permissions.
 */
export function setConfigValue(ctx, dottedKey, value) {
  const parts = dottedKey.split('.')
  for (const p of parts) {
    if (!p) throw new Error(`invalid config key "${dottedKey}"`)
    if (FORBIDDEN_KEY.has(p)) throw new Error(`refusing forbidden key segment "${p}"`)
  }
  fs.mkdirSync(ctx.configDir, { recursive: true })
  const cfg = readJsoncForWrite(ctx.configFile) // throws on malformed existing file
  let node = cfg
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {}
    node = node[parts[i]]
  }
  node[parts[parts.length - 1]] = coerce(value)
  writeFileAtomic600(ctx.configFile, JSON.stringify(cfg, null, 2) + '\n')
  return ctx.configFile
}

/** Write via temp file + rename, creating the file 0600 so secrets are never
 * world-readable, not even momentarily. */
export function writeFileAtomic600(file, contents) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, contents, { mode: 0o600 })
  try {
    fs.chmodSync(tmp, 0o600)
  } catch {
    /* platforms without POSIX modes */
  }
  fs.renameSync(tmp, file)
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
export const REDACTED = '***redacted***'

/** True if any segment of a dotted key path looks like a secret. */
export function isSecretKeyPath(dottedKey) {
  return String(dottedKey).split('.').some((seg) => SECRET_KEY.test(seg))
}

/** Deep copy of a config object with secret-looking values masked. */
export function redactConfig(obj) {
  if (Array.isArray(obj)) return obj.map(redactConfig)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_sources') continue
      out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? REDACTED : redactConfig(v)
    }
    return out
  }
  return obj
}

// ---- managed-file receipt (ownership) --------------------------------------
// Tracks what the installer created so update/uninstall never touch a file the
// user owns or has modified since install.

export const RECEIPT_NAME = 'omf-managed.json'
const receiptPath = (ctx) => path.join(ctx.configDir, RECEIPT_NAME)

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function readReceipt(ctx) {
  const r = readJsoncSafe(receiptPath(ctx), null)
  if (r && typeof r === 'object') return { skills: {}, ...r }
  return { skills: {} }
}

export function writeReceipt(ctx, receipt) {
  fs.mkdirSync(ctx.configDir, { recursive: true })
  fs.writeFileSync(receiptPath(ctx), JSON.stringify({ version: 1, ...receipt }, null, 2) + '\n')
}

export function removeReceipt(ctx) {
  try {
    fs.unlinkSync(receiptPath(ctx))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
}

// ---- skill names (path-traversal safe) --------------------------------------

/**
 * Validate and normalize a skill name into a safe slug that also satisfies
 * Codebuff's own rule (1-64 chars, lowercase alphanumeric segments joined by
 * single hyphens, no leading/trailing/consecutive hyphens). This is the one gate
 * every skill-mutating command passes user input through — so a name the CLI
 * accepts is a name Codebuff will accept.
 */
export function normalizeSkillName(raw) {
  const input = String(raw ?? '').trim()
  if (!input) throw new Error('skill name is empty')
  if (/[\\/]/.test(input) || input.includes('..')) {
    throw new Error(`invalid skill name "${raw}" (no slashes or "..")`)
  }
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '') // trim hyphens
  if (!slug) throw new Error(`invalid skill name "${raw}" (nothing usable after normalizing)`)
  if (slug.length > 64) throw new Error(`invalid skill name "${raw}" (max 64 characters)`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`invalid skill name "${raw}"`)
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

async function post(channel, url, body, timeoutMs = 10000) {
  try {
    if (typeof fetch !== 'function') return { channel, ok: false, detail: 'fetch unavailable (need Node >= 20)' }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      return { channel, ok: res.ok, detail: `HTTP ${res.status}` }
    } finally {
      clearTimeout(t)
    }
  } catch (e) {
    return { channel, ok: false, detail: e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message }
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
