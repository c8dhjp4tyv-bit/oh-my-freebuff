#!/usr/bin/env node
// oh-my-freebuff CLI — install and manage the agent pack for Freebuff / Codebuff.
// Zero runtime dependencies: filesystem plumbing plus a few HTTP posts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  c, paint, readPackVersion, which, resolveContext, PACK_NAME, readJsonc,
  readJsoncSafe, loadConfig, setConfigValue, getConfigValue, redactConfig,
  isSecretKeyPath, REDACTED, sendNotification, skillDirFor, isGitIgnored,
  USER_CONFIG, readReceipt, writeReceipt, removeReceipt, sha256,
} from './lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACK_ROOT = path.resolve(__dirname, '..')
const log = (...a) => console.log(...a)
const err = (...a) => console.error(...a)
const version = () => readPackVersion(PACK_ROOT)

// ---- helpers ----------------------------------------------------------------

function listPackAgents() {
  const dir = path.join(PACK_ROOT, 'agents')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
}

/** Skill names the pack ships (skills/<name>/SKILL.md). */
function shippedSkillNames() {
  const dir = path.join(PACK_ROOT, 'skills')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) =>
    fs.existsSync(path.join(dir, n, 'SKILL.md')),
  )
}

function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--global' || a === '-g') opts.global = true
    else if (a === '--force' || a === '-f') opts.force = true
    else if (a === '--show-secrets') opts.showSecrets = true
    else if (a === '--dir' || a === '-d') opts.dir = argv[++i]
    else if (a.startsWith('--dir=')) opts.dir = a.slice(6)
    else if (a === '--help' || a === '-h') opts.help = true
    else opts._.push(a)
  }
  return opts
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

function agentDescription(file) {
  const src = fs.readFileSync(path.join(PACK_ROOT, 'agents', file), 'utf8')
  const m = src.match(/\*\s+\S.*?—\s*(.+)/)
  return { id: file.replace(/\.ts$/, ''), note: m ? m[1].trim() : '' }
}

function requireInstalled(ctx) {
  if (!fs.existsSync(ctx.packDir)) {
    err(paint(c.red, `oh-my-freebuff is not installed at ${ctx.packDir}`))
    err(paint(c.dim, `Run: omf install${ctx.scope === 'global' ? ' --global' : ''}`))
    process.exit(1)
  }
  return ctx.packDir
}

// ---- install / update / uninstall ------------------------------------------

function cmdInstall(ctx, opts) {
  if (fs.existsSync(ctx.packDir) && !opts.force) {
    err(paint(c.yellow, `! ${PACK_NAME} is already installed at ${ctx.packDir}`))
    err(paint(c.dim, '  Re-run with --force to overwrite (or: omf update).'))
    process.exit(1)
  }

  // Agents live in our own namespaced dir — safe to replace wholesale.
  fs.rmSync(ctx.packDir, { recursive: true, force: true })
  copyDir(path.join(PACK_ROOT, 'agents'), ctx.packDir)
  for (const extra of ['agents.manifest.json', 'models.json']) {
    fs.copyFileSync(path.join(PACK_ROOT, extra), path.join(ctx.packDir, extra))
  }
  const hooksSrc = path.join(PACK_ROOT, 'hooks')
  if (fs.existsSync(hooksSrc)) copyDir(hooksSrc, path.join(ctx.packDir, 'hooks'))

  // Types are shared and Codebuff also generates them. Never clobber an existing
  // agent-definition.ts — only seed our shim when none is present.
  let typesNote
  if (fs.existsSync(ctx.typesFile)) {
    typesNote = 'kept existing .agents/types'
  } else {
    copyDir(path.join(PACK_ROOT, 'types'), path.join(ctx.agentsDir, 'types'))
    typesNote = 'wrote .agents/types shim'
  }

  // Skills go to the shared .agents/skills/<name>/SKILL.md that Codebuff reads.
  // Ownership is tracked in a receipt: we only refresh a skill we installed and
  // that the user hasn't since modified. A user's own skill (or a modified copy
  // of ours) is never overwritten — not even with --force.
  const receipt = readReceipt(ctx)
  let skillsAdded = 0
  let skillsUpdated = 0
  let skillsKept = 0
  for (const name of shippedSkillNames()) {
    const destDir = path.join(ctx.skillsDir, name)
    const destFile = path.join(destDir, 'SKILL.md')
    const src = path.join(PACK_ROOT, 'skills', name, 'SKILL.md')
    if (fs.existsSync(destFile)) {
      const ours = receipt.skills[name] && receipt.skills[name] === sha256(destFile)
      if (ours) {
        fs.copyFileSync(src, destFile)
        receipt.skills[name] = sha256(destFile)
        skillsUpdated++
      } else {
        skillsKept++ // user-owned or user-modified — leave it alone
      }
    } else {
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, destFile)
      receipt.skills[name] = sha256(destFile)
      skillsAdded++
    }
  }
  writeReceipt(ctx, receipt)

  const preset = getConfigValue(ctx, 'modelPreset')
  if (preset && preset !== 'balanced') applyPreset(ctx, preset, true)

  log(paint(c.green, `✓ Installed ${PACK_NAME} v${version()}`))
  log(`  ${paint(c.dim, 'agents:')}   ${listPackAgents().length}  → ${ctx.packDir}`)
  log(`  ${paint(c.dim, 'types:')}    ${typesNote}`)
  log(`  ${paint(c.dim, 'skills:')}   ${skillsAdded} added${skillsUpdated ? `, ${skillsUpdated} updated` : ''}${skillsKept ? `, ${skillsKept} kept (yours)` : ''}  → ${ctx.skillsDir}`)
  if (preset) log(`  ${paint(c.dim, 'preset:')}   ${preset}`)
  log('')
  log('Next: run Freebuff in this project and pick an orchestrator, e.g.')
  log(paint(c.cyan, '  freebuff') + paint(c.dim, '   then: "use omf-team to <your task>"'))
}

function cmdUninstall(ctx) {
  if (!fs.existsSync(ctx.packDir)) {
    log(paint(c.yellow, `Nothing to remove — not installed at ${ctx.packDir}`))
    return
  }
  fs.rmSync(ctx.packDir, { recursive: true, force: true })

  // Only remove skills we installed AND that are still byte-identical to what we
  // wrote. Anything the user created or edited is left untouched.
  const receipt = readReceipt(ctx)
  let removedSkills = 0
  let keptSkills = 0
  for (const [name, hash] of Object.entries(receipt.skills || {})) {
    const destFile = path.join(ctx.skillsDir, name, 'SKILL.md')
    if (!fs.existsSync(destFile)) continue
    if (hash === sha256(destFile)) {
      fs.rmSync(path.join(ctx.skillsDir, name), { recursive: true, force: true })
      removedSkills++
    } else {
      keptSkills++ // modified since install → not ours to delete
    }
  }
  removeReceipt(ctx)

  log(paint(c.green, `✓ Removed ${ctx.packDir}`))
  if (removedSkills) log(paint(c.dim, `  removed ${removedSkills} unmodified shipped skill(s)`))
  if (keptSkills) log(paint(c.yellow, `  kept ${keptSkills} skill(s) you modified since install`))
  log(paint(c.dim, '  Left .agents/types in place (shared with Codebuff and other agents).'))
}

// ---- list -------------------------------------------------------------------

function cmdList() {
  const agents = listPackAgents()
  const manifest = readJsoncSafe(path.join(PACK_ROOT, 'agents.manifest.json'), {}).tiers || {}
  log(paint(c.bold, `oh-my-freebuff v${version()} — ${agents.length} agents`))
  log('')
  const orchestrators = agents.filter((a) => a.startsWith('omf-'))
  const specialists = agents.filter((a) => !a.startsWith('omf-'))
  const row = (file) => {
    const { id, note } = agentDescription(file)
    const tier = manifest[id] ? paint(c.dim, `[${manifest[id]}]`) : ''
    return `  ${paint(c.bold, id.padEnd(18))} ${paint(c.dim, note)} ${tier}`
  }
  log(paint(c.cyan, 'Orchestrators') + paint(c.dim, ' (entry points)'))
  orchestrators.forEach((f) => log(row(f)))
  log('')
  log(paint(c.cyan, 'Specialists') + paint(c.dim, ' (spawned by orchestrators, or use directly)'))
  specialists.forEach((f) => log(row(f)))
}

// ---- model presets ----------------------------------------------------------

function applyPreset(ctx, name, quiet = false) {
  const models = readJsonc(path.join(PACK_ROOT, 'models.json'))
  const preset = models.presets[name]
  if (!preset) {
    err(paint(c.red, `Unknown preset: ${name}`))
    err(paint(c.dim, `Available: ${Object.keys(models.presets).join(', ')}`))
    process.exit(1)
  }
  requireInstalled(ctx)
  const manifest = readJsonc(path.join(PACK_ROOT, 'agents.manifest.json')).tiers

  let changed = 0
  for (const file of fs.readdirSync(ctx.packDir).filter((f) => f.endsWith('.ts'))) {
    const filePath = path.join(ctx.packDir, file)
    const src = fs.readFileSync(filePath, 'utf8')
    const idMatch = src.match(/\bid:\s*'([^']+)'/)
    if (!idMatch) continue
    const model = preset[manifest[idMatch[1]]]
    if (!model) continue
    const next = src.replace(/^(\s*model:\s*)'[^']*'/m, `$1'${model}'`)
    if (next !== src) {
      fs.writeFileSync(filePath, next)
      changed++
    }
  }
  setConfigValue(ctx, 'modelPreset', name)
  if (!quiet) {
    log(paint(c.green, `✓ Applied '${name}' preset`) + paint(c.dim, ` (${preset.description || ''})`))
    log(`  ${paint(c.dim, 'updated:')} ${changed} agent files in ${ctx.packDir}`)
    for (const t of models.tiers) if (preset[t]) log(`  ${paint(c.dim, t.padEnd(9))} ${preset[t]}`)
  }
}

function cmdPreset(ctx, opts) {
  const name = opts._[0]
  const models = readJsonc(path.join(PACK_ROOT, 'models.json'))
  if (!name) {
    const current = getConfigValue(ctx, 'modelPreset') || models.defaultPreset
    log(paint(c.bold, 'Model presets') + paint(c.dim, `  (current: ${current})`))
    log('')
    for (const [k, v] of Object.entries(models.presets)) {
      const mark = k === current ? paint(c.green, '●') : ' '
      log(`  ${mark} ${paint(c.bold, k.padEnd(10))} ${paint(c.dim, v.description || '')}`)
    }
    log('')
    log(paint(c.dim, 'Apply with:  omf preset <name>'))
    return
  }
  applyPreset(ctx, name)
}

// ---- config / setup ---------------------------------------------------------

function cmdConfig(ctx, opts) {
  const [sub, key, ...valueParts] = opts._
  if (sub === 'set') {
    if (!key || valueParts.length === 0) {
      err(paint(c.red, 'Usage: omf config set <key> <value> [--global]'))
      process.exit(1)
    }
    const file = setConfigValue(ctx, key, valueParts.join(' '))
    log(paint(c.green, `✓ Set ${key}`) + paint(c.dim, ` in ${file}`))
  } else if (sub === 'get') {
    const v = key ? getConfigValue(ctx, key) : loadConfig(ctx)
    let shown
    if (opts.showSecrets) shown = key ? v : stripSources(v)
    else if (key) shown = isSecretKeyPath(key) ? REDACTED : redactConfig(v)
    else shown = redactConfig(v)
    log(typeof shown === 'object' ? JSON.stringify(shown, null, 2) : String(shown))
  } else {
    const cfg = loadConfig(ctx)
    const shown = opts.showSecrets ? stripSources(cfg) : redactConfig(cfg)
    log(paint(c.bold, 'Effective config') + paint(c.dim, ' (user < project)'))
    log(JSON.stringify(shown, null, 2))
    if (!opts.showSecrets) log(paint(c.dim, '(secrets hidden — pass --show-secrets to reveal)'))
    log('')
    log(paint(c.dim, `project: ${ctx.scope === 'global' ? '(global scope)' : ctx.configFile}`))
    log(paint(c.dim, `user:    ${USER_CONFIG}`))
  }
}

function stripSources(cfg) {
  const { _sources, ...rest } = cfg
  return rest
}

function cmdSetup(ctx, opts) {
  log(paint(c.bold, 'oh-my-freebuff setup'))
  log('')
  if (!fs.existsSync(ctx.packDir)) cmdInstall(ctx, opts)
  else log(paint(c.dim, `✓ pack already installed at ${ctx.packDir}`))

  if (!fs.existsSync(ctx.configFile)) {
    setConfigValue(ctx, 'modelPreset', 'balanced')
    setConfigValue(ctx, 'notifications', {})
    log(paint(c.green, `✓ wrote ${ctx.configFile}`))
  } else {
    log(paint(c.dim, `✓ config exists: ${ctx.configFile}`))
  }

  const knowledgeDest = path.join(ctx.root, 'knowledge.md')
  const knowledgeSrc = path.join(PACK_ROOT, 'templates', 'knowledge.md')
  if (!fs.existsSync(knowledgeDest) && fs.existsSync(knowledgeSrc)) {
    fs.copyFileSync(knowledgeSrc, knowledgeDest)
    log(paint(c.green, `✓ created ${knowledgeDest}`) + paint(c.dim, ' (fill it in — every agent reads it)'))
  } else {
    log(paint(c.dim, '✓ knowledge file present or template missing'))
  }
  log('')
  log(paint(c.bold, 'Ready.') + ' Try: ' + paint(c.cyan, 'freebuff') + paint(c.dim, '  then "use omf-team to <task>"'))
  log(paint(c.dim, 'Pick a cost tier with:  omf preset budget|balanced|premium'))
}

// ---- skills -----------------------------------------------------------------

function listInstalledSkills(ctx) {
  if (!fs.existsSync(ctx.skillsDir)) return []
  return fs
    .readdirSync(ctx.skillsDir)
    .filter((n) => fs.existsSync(path.join(ctx.skillsDir, n, 'SKILL.md')))
    .sort()
}

function cmdSkill(ctx, opts) {
  const [sub, arg] = opts._
  switch (sub) {
    case 'list':
    case undefined: {
      const skills = listInstalledSkills(ctx)
      if (skills.length === 0) {
        log(paint(c.dim, `No skills in ${ctx.skillsDir}. Add one with: omf skill add <name>`))
        return
      }
      log(paint(c.bold, `Skills (${skills.length})`) + paint(c.dim, `  ${ctx.skillsDir}`))
      for (const name of skills) {
        const src = fs.readFileSync(path.join(ctx.skillsDir, name, 'SKILL.md'), 'utf8')
        const desc = (src.match(/description:\s*(.+)/) || [])[1] || ''
        log(`  ${paint(c.bold, name.padEnd(22))} ${paint(c.dim, desc.trim())}`)
      }
      return
    }
    case 'add': {
      if (!arg) return usageExit('omf skill add <name>')
      const { slug, dir, file } = safeSkill(ctx, arg)
      if (fs.existsSync(file)) {
        err(paint(c.yellow, `Skill already exists: ${file}`))
        process.exit(1)
      }
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, skillTemplate(slug))
      log(paint(c.green, `✓ Created ${file}`))
      log(paint(c.dim, '  Edit it to describe when the skill applies and the steps to follow.'))
      return
    }
    case 'remove':
    case 'rm': {
      if (!arg) return usageExit('omf skill remove <name>')
      const { dir } = safeSkill(ctx, arg)
      if (!fs.existsSync(dir)) {
        err(paint(c.yellow, `No such skill: ${arg}`))
        process.exit(1)
      }
      fs.rmSync(dir, { recursive: true, force: true })
      log(paint(c.green, `✓ Removed ${dir}`))
      return
    }
    case 'search': {
      if (!arg) return usageExit('omf skill search <query>')
      const q = arg.toLowerCase()
      const hits = listInstalledSkills(ctx).filter((name) => {
        const body = fs.readFileSync(path.join(ctx.skillsDir, name, 'SKILL.md'), 'utf8')
        return (name + body).toLowerCase().includes(q)
      })
      if (hits.length === 0) {
        log(paint(c.dim, `No skills match "${arg}"`))
        return
      }
      log(paint(c.bold, `Matches for "${arg}":`))
      hits.forEach((n) => log(`  ${n}`))
      return
    }
    default:
      err(paint(c.red, `Unknown skill command: ${sub}`))
      err(paint(c.dim, 'Use: omf skill list|add|remove|search'))
      process.exit(1)
  }
}

function safeSkill(ctx, name) {
  try {
    return skillDirFor(ctx, name)
  } catch (e) {
    err(paint(c.red, e.message))
    process.exit(1)
  }
}

function usageExit(usage) {
  err(paint(c.red, `Usage: ${usage}`))
  process.exit(1)
}

function skillTemplate(name) {
  return `---
name: ${name}
description: One line describing when an agent should use this skill.
---

Steps the agent follows when this skill applies:

1. ...
2. ...
`
}

// ---- notifications ----------------------------------------------------------

async function cmdNotify(ctx, opts) {
  const [sub, ...rest] = opts._
  switch (sub) {
    case 'setup': {
      const channel = rest[0]
      if (!channel) {
        log(paint(c.bold, 'Notification setup'))
        log('')
        log('Pick a channel and pass its settings, e.g.:')
        log(paint(c.cyan, '  omf notify setup file ./omf-notify.log'))
        log(paint(c.cyan, '  omf notify setup telegram <bot-token> <chat-id>'))
        log(paint(c.cyan, '  omf notify setup discord <webhook-url>'))
        log(paint(c.cyan, '  omf notify setup slack <webhook-url>'))
        log('')
        log(paint(c.dim, 'Secrets can also reference an env var: use "${SLACK_WEBHOOK}" as the value.'))
        return
      }
      if (channel === 'file') {
        setConfigValue(ctx, 'notifications.file', rest[1] || './omf-notify.log')
      } else if (channel === 'telegram') {
        if (rest.length < 3) return usageExit('omf notify setup telegram <token> <chatId>')
        setConfigValue(ctx, 'notifications.telegram.token', rest[1])
        setConfigValue(ctx, 'notifications.telegram.chatId', rest[2])
      } else if (channel === 'discord' || channel === 'slack') {
        if (!rest[1]) return usageExit(`omf notify setup ${channel} <webhook-url>`)
        setConfigValue(ctx, `notifications.${channel}.webhook`, rest[1])
      } else {
        err(paint(c.red, `Unknown channel: ${channel}`))
        process.exit(1)
      }
      log(paint(c.green, `✓ Configured ${channel} notifications (${ctx.scope})`))
      log(paint(c.dim, 'Secrets are stored with 0600 permissions. Test with: omf notify test'))
      return
    }
    case 'status': {
      const channels = Object.keys(loadConfig(ctx).notifications || {})
      if (channels.length === 0) {
        log(paint(c.dim, 'No channels configured. Run: omf notify setup'))
        return
      }
      log(paint(c.bold, 'Configured channels:'))
      channels.forEach((ch) => log(`  ${paint(c.green, '●')} ${ch}`))
      return
    }
    case 'test':
    case 'send': {
      const msg = rest.join(' ') || 'oh-my-freebuff test notification from {{projectName}}'
      const results = await sendNotification(msg, ctx)
      if (results.length === 0) {
        err(paint(c.yellow, 'No channels configured — run: omf notify setup'))
        process.exit(1)
      }
      for (const r of results) {
        const mark = r.ok ? paint(c.green, '✓') : paint(c.red, '✗')
        log(`  ${mark} ${r.channel}${r.detail ? paint(c.dim, ' — ' + r.detail) : ''}`)
      }
      return
    }
    default:
      err(paint(c.red, `Unknown notify command: ${sub || ''}`))
      err(paint(c.dim, 'Use: omf notify setup|test|status'))
      process.exit(1)
  }
}

// ---- doctor -----------------------------------------------------------------

function cmdDoctor(ctx) {
  let ok = true
  const check = (label, pass, detail) => {
    const mark = pass ? paint(c.green, '✓') : paint(c.red, '✗')
    log(`  ${mark} ${label}${detail ? paint(c.dim, '  ' + detail) : ''}`)
    if (!pass) ok = false
  }
  const warn = (label, detail) => log(`  ${paint(c.yellow, '!')} ${label}${detail ? paint(c.dim, '  ' + detail) : ''}`)

  log(paint(c.bold, 'oh-my-freebuff doctor'))
  log('')
  check('Node >= 18', Number(process.versions.node.split('.')[0]) >= 18, `found v${process.versions.node}`)
  const cli = which('freebuff') || which('codebuff') || which('cb')
  check('Freebuff or Codebuff CLI on PATH', !!cli, cli || 'npm i -g freebuff')

  const installed = fs.existsSync(ctx.packDir)
  check('Pack installed', installed, installed ? ctx.packDir : `run: omf install${ctx.scope === 'global' ? ' --global' : ''}`)
  if (installed) {
    check('types/agent-definition present', fs.existsSync(ctx.typesFile), fs.existsSync(ctx.typesFile) ? '' : 'run: omf update')
    check('agent files present', fs.readdirSync(ctx.packDir).filter((f) => f.endsWith('.ts')).length > 0, `${fs.readdirSync(ctx.packDir).filter((f) => f.endsWith('.ts')).length} agents`)
    const skills = fs.existsSync(ctx.skillsDir) ? fs.readdirSync(ctx.skillsDir).filter((n) => fs.existsSync(path.join(ctx.skillsDir, n, 'SKILL.md'))).length : 0
    check('skills discoverable (.agents/skills/*/SKILL.md)', skills > 0, `${skills} skill(s)`)
  }
  const preset = getConfigValue(ctx, 'modelPreset')
  if (preset) check('model preset', true, preset)

  // Secret hygiene: if secrets live in the project config, it should be ignored.
  if (ctx.scope !== 'global' && fs.existsSync(ctx.configFile)) {
    const cfg = loadConfig(ctx)
    const hasSecrets = JSON.stringify(cfg.notifications || {}).match(/token|webhook|password/i)
    if (hasSecrets) {
      const ignored = isGitIgnored(ctx.root, path.relative(ctx.root, ctx.configFile) || '.freebuff/omf.jsonc')
      if (ignored === false) warn('.freebuff is NOT git-ignored', 'secrets could be committed — add .freebuff/ to .gitignore')
      else if (ignored === true) check('.freebuff git-ignored', true, 'secrets protected')
    }
  }

  log('')
  log(ok ? paint(c.green, 'All good.') : paint(c.yellow, 'Some checks failed — see above.'))
  if (!ok) process.exit(1)
}

// ---- help -------------------------------------------------------------------

function cmdHelp() {
  log(`${paint(c.bold, 'oh-my-freebuff')} ${paint(c.dim, 'v' + version())} — multi-agent pack for Freebuff / Codebuff

${paint(c.bold, 'Usage')}
  omf <command> [options]

${paint(c.bold, 'Setup')}
  ${paint(c.cyan, 'setup')}        Install pack + seed config + knowledge.md (one-shot)
  ${paint(c.cyan, 'install')}      Copy the agent pack into .agents
  ${paint(c.cyan, 'update')}       Re-copy the pack (keeps your preset)
  ${paint(c.cyan, 'uninstall')}    Remove the pack
  ${paint(c.cyan, 'doctor')}       Check your setup

${paint(c.bold, 'Agents & models')}
  ${paint(c.cyan, 'list')}                 List the agents
  ${paint(c.cyan, 'preset')} [name]        Show or apply a model preset (budget|balanced|premium)

${paint(c.bold, 'Config')}
  ${paint(c.cyan, 'config')}               Print effective config (secrets hidden)
  ${paint(c.cyan, 'config get')} <key>     Read a value
  ${paint(c.cyan, 'config set')} <k> <v>   Write a value (--global for user scope)

${paint(c.bold, 'Skills')}
  ${paint(c.cyan, 'skill list')}           List custom skills
  ${paint(c.cyan, 'skill add')} <name>     Scaffold a new skill
  ${paint(c.cyan, 'skill remove')} <name>  Delete a skill
  ${paint(c.cyan, 'skill search')} <q>     Search skills

${paint(c.bold, 'Notifications')}
  ${paint(c.cyan, 'notify setup')} <ch>    Configure telegram|discord|slack|file
  ${paint(c.cyan, 'notify test')}          Send a test notification
  ${paint(c.cyan, 'notify status')}        Show configured channels

${paint(c.bold, 'Options')}
  -g, --global       Target ~/.agents and user-scope config
  -d, --dir <path>   Operate on <path> (its .agents and .freebuff)
  -f, --force        Overwrite an existing install
      --show-secrets Reveal secrets in "config" output`)
}

// ---- dispatch ---------------------------------------------------------------

async function main() {
  const [, , cmd, ...rest] = process.argv
  const opts = parseArgs(rest)
  const ctx = resolveContext(opts)
  switch (cmd) {
    case 'install': case 'i': return opts.help ? cmdHelp() : cmdInstall(ctx, opts)
    case 'update': case 'up': return cmdInstall(ctx, { ...opts, force: true })
    case 'uninstall': case 'rm': return cmdUninstall(ctx)
    case 'setup': return cmdSetup(ctx, opts)
    case 'list': case 'ls': return cmdList()
    case 'preset': return cmdPreset(ctx, opts)
    case 'config': return cmdConfig(ctx, opts)
    case 'skill': case 'skills': return cmdSkill(ctx, opts)
    case 'notify': return cmdNotify(ctx, opts)
    case 'doctor': return cmdDoctor(ctx)
    case 'version': case '--version': case '-v': return log(version())
    case undefined: case 'help': case '--help': case '-h': return cmdHelp()
    default:
      err(paint(c.red, `Unknown command: ${cmd}`))
      err(paint(c.dim, 'Run `omf help` for usage.'))
      process.exit(1)
  }
}

main().catch((e) => {
  err(paint(c.red, `Error: ${e.message}`))
  process.exit(1)
})
