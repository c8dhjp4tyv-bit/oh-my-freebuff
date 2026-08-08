#!/usr/bin/env node
// oh-my-freebuff CLI — install and manage the agent pack for Freebuff / Codebuff.
// Zero runtime dependencies: it's filesystem plumbing plus a few HTTP posts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  c, paint, readPackVersion, which, resolveAgentsDir, installedPackDir,
  PACK_NAME, readJsonc, readJsoncSafe, loadConfig, setConfigValue,
  getConfigValue, sendNotification, PROJECT_CONFIG, USER_CONFIG,
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

function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--global' || a === '-g') opts.global = true
    else if (a === '--force' || a === '-f') opts.force = true
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

function requireInstalled(opts) {
  const dir = installedPackDir(opts)
  if (!fs.existsSync(dir)) {
    err(paint(c.red, `oh-my-freebuff is not installed at ${dir}`))
    err(paint(c.dim, `Run: omf install${opts.global ? ' --global' : ''}`))
    process.exit(1)
  }
  return dir
}

// ---- install / update / uninstall ------------------------------------------

function cmdInstall(opts) {
  const agentsDir = resolveAgentsDir(opts)
  const packDest = path.join(agentsDir, PACK_NAME)
  const typesDest = path.join(agentsDir, 'types')

  if (fs.existsSync(packDest) && !opts.force) {
    err(paint(c.yellow, `! ${PACK_NAME} is already installed at ${packDest}`))
    err(paint(c.dim, '  Re-run with --force to overwrite (or: omf update).'))
    process.exit(1)
  }

  fs.rmSync(packDest, { recursive: true, force: true })
  copyDir(path.join(PACK_ROOT, 'agents'), packDest)
  copyDir(path.join(PACK_ROOT, 'types'), typesDest)
  for (const extra of ['skills', 'agents.manifest.json', 'models.json']) {
    const src = path.join(PACK_ROOT, extra)
    if (fs.existsSync(src)) {
      const dest = path.join(packDest, extra)
      if (fs.statSync(src).isDirectory()) copyDir(src, dest)
      else fs.copyFileSync(src, dest)
    }
  }
  const hooksSrc = path.join(PACK_ROOT, 'hooks')
  if (fs.existsSync(hooksSrc)) copyDir(hooksSrc, path.join(packDest, 'hooks'))

  const agents = listPackAgents()
  const preset = getConfigValue('modelPreset')
  if (preset && preset !== 'balanced') applyPreset(preset, opts, true)

  log(paint(c.green, `✓ Installed ${PACK_NAME} v${version()}`))
  log(`  ${paint(c.dim, 'location:')} ${packDest}`)
  log(`  ${paint(c.dim, 'agents:')}   ${agents.length}`)
  if (preset) log(`  ${paint(c.dim, 'preset:')}   ${preset}`)
  log('')
  log('Next: run Freebuff in this project and pick an orchestrator, e.g.')
  log(paint(c.cyan, '  freebuff') + paint(c.dim, '   then: "use omf-team to <your task>"'))
}

function cmdUninstall(opts) {
  const packDest = installedPackDir(opts)
  if (!fs.existsSync(packDest)) {
    log(paint(c.yellow, `Nothing to remove — not installed at ${packDest}`))
    return
  }
  fs.rmSync(packDest, { recursive: true, force: true })
  log(paint(c.green, `✓ Removed ${packDest}`))
  log(paint(c.dim, '  (Left .agents/types in place; it may be shared.)'))
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

function applyPreset(name, opts, quiet = false) {
  const models = readJsonc(path.join(PACK_ROOT, 'models.json'))
  const preset = models.presets[name]
  if (!preset) {
    err(paint(c.red, `Unknown preset: ${name}`))
    err(paint(c.dim, `Available: ${Object.keys(models.presets).join(', ')}`))
    process.exit(1)
  }
  const packDir = requireInstalled(opts)
  const manifest = readJsonc(path.join(PACK_ROOT, 'agents.manifest.json')).tiers

  let changed = 0
  for (const file of fs.readdirSync(packDir).filter((f) => f.endsWith('.ts'))) {
    const filePath = path.join(packDir, file)
    let src = fs.readFileSync(filePath, 'utf8')
    const idMatch = src.match(/\bid:\s*'([^']+)'/)
    if (!idMatch) continue
    const tier = manifest[idMatch[1]]
    const model = tier && preset[tier]
    if (!model) continue
    const next = src.replace(/^(\s*model:\s*)'[^']*'/m, `$1'${model}'`)
    if (next !== src) {
      fs.writeFileSync(filePath, next)
      changed++
    }
  }
  setConfigValue(opts.global ? 'global' : 'project', 'modelPreset', name)
  if (!quiet) {
    log(paint(c.green, `✓ Applied '${name}' preset`) + paint(c.dim, ` (${preset.description || ''})`))
    log(`  ${paint(c.dim, 'updated:')} ${changed} agent files in ${packDir}`)
    for (const t of models.tiers) {
      if (preset[t]) log(`  ${paint(c.dim, t.padEnd(9))} ${preset[t]}`)
    }
  }
}

function cmdPreset(opts) {
  const name = opts._[0]
  const models = readJsonc(path.join(PACK_ROOT, 'models.json'))
  if (!name) {
    const current = getConfigValue('modelPreset') || models.defaultPreset
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
  applyPreset(name, opts)
}

// ---- config / setup ---------------------------------------------------------

function cmdConfig(opts) {
  const [sub, key, ...valueParts] = opts._
  if (sub === 'set') {
    if (!key || valueParts.length === 0) {
      err(paint(c.red, 'Usage: omf config set <key> <value> [--global]'))
      process.exit(1)
    }
    const file = setConfigValue(opts.global ? 'global' : 'project', key, valueParts.join(' '))
    log(paint(c.green, `✓ Set ${key}`) + paint(c.dim, ` in ${file}`))
  } else if (sub === 'get') {
    const v = key ? getConfigValue(key) : loadConfig()
    log(typeof v === 'object' ? JSON.stringify(stripInternal(v), null, 2) : String(v))
  } else {
    const cfg = stripInternal(loadConfig())
    log(paint(c.bold, 'Effective config') + paint(c.dim, ' (user < project)'))
    log(JSON.stringify(cfg, null, 2))
    log('')
    log(paint(c.dim, `project: ${PROJECT_CONFIG()}`))
    log(paint(c.dim, `user:    ${USER_CONFIG()}`))
  }
}

function stripInternal(cfg) {
  const { _user, _project, ...rest } = cfg
  return rest
}

function cmdSetup(opts) {
  log(paint(c.bold, `oh-my-freebuff setup`))
  log('')
  // 1. install pack if missing
  const packDest = installedPackDir(opts)
  if (!fs.existsSync(packDest)) {
    cmdInstall(opts)
  } else {
    log(paint(c.dim, `✓ pack already installed at ${packDest}`))
  }
  // 2. seed project config
  const cfgFile = PROJECT_CONFIG()
  if (!fs.existsSync(cfgFile)) {
    setConfigValue('project', 'modelPreset', 'balanced')
    setConfigValue('project', 'notifications', {})
    log(paint(c.green, `✓ wrote ${cfgFile}`))
  } else {
    log(paint(c.dim, `✓ config exists: ${cfgFile}`))
  }
  // 3. seed knowledge.md at project root if absent
  const knowledgeDest = path.join(process.cwd(), 'knowledge.md')
  const knowledgeSrc = path.join(PACK_ROOT, 'templates', 'knowledge.md')
  if (!fs.existsSync(knowledgeDest) && fs.existsSync(knowledgeSrc)) {
    fs.copyFileSync(knowledgeSrc, knowledgeDest)
    log(paint(c.green, `✓ created knowledge.md`) + paint(c.dim, ' (fill it in — every agent reads it)'))
  } else {
    log(paint(c.dim, `✓ knowledge file present or template missing`))
  }
  log('')
  log(paint(c.bold, 'Ready.') + ' Try: ' + paint(c.cyan, 'freebuff') + paint(c.dim, '  then "use omf-team to <task>"'))
  log(paint(c.dim, 'Pick a cost tier with:  omf preset budget|balanced|premium'))
}

// ---- skills -----------------------------------------------------------------

function skillsDir(opts) {
  return path.join(requireInstalled(opts), 'skills')
}

function cmdSkill(opts) {
  const [sub, arg] = opts._
  const dir = () => {
    const d = skillsDir(opts)
    fs.mkdirSync(d, { recursive: true })
    return d
  }
  switch (sub) {
    case 'list':
    case undefined: {
      const d = skillsDir(opts)
      const files = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md') : []
      if (files.length === 0) { log(paint(c.dim, 'No skills. Add one with: omf skill add <name>')); return }
      log(paint(c.bold, `Skills (${files.length})`) + paint(c.dim, `  ${d}`))
      for (const f of files) {
        const src = fs.readFileSync(path.join(d, f), 'utf8')
        const desc = (src.match(/description:\s*(.+)/) || [])[1] || ''
        log(`  ${paint(c.bold, f.replace(/\.md$/, '').padEnd(22))} ${paint(c.dim, desc.trim())}`)
      }
      return
    }
    case 'add': {
      if (!arg) { err(paint(c.red, 'Usage: omf skill add <name>')); process.exit(1) }
      const slug = arg.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
      const file = path.join(dir(), `${slug}.md`)
      if (fs.existsSync(file)) { err(paint(c.yellow, `Skill already exists: ${file}`)); process.exit(1) }
      fs.writeFileSync(file, skillTemplate(slug))
      log(paint(c.green, `✓ Created ${file}`))
      log(paint(c.dim, '  Edit it to describe when the skill applies and the steps to follow.'))
      return
    }
    case 'remove':
    case 'rm': {
      if (!arg) { err(paint(c.red, 'Usage: omf skill remove <name>')); process.exit(1) }
      const slug = arg.replace(/\.md$/, '')
      const file = path.join(skillsDir(opts), `${slug}.md`)
      if (!fs.existsSync(file)) { err(paint(c.yellow, `No such skill: ${slug}`)); process.exit(1) }
      fs.rmSync(file)
      log(paint(c.green, `✓ Removed ${file}`))
      return
    }
    case 'search': {
      if (!arg) { err(paint(c.red, 'Usage: omf skill search <query>')); process.exit(1) }
      const d = skillsDir(opts)
      const files = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md')) : []
      const q = arg.toLowerCase()
      const hits = files.filter((f) => (f + fs.readFileSync(path.join(d, f), 'utf8')).toLowerCase().includes(q))
      if (hits.length === 0) { log(paint(c.dim, `No skills match "${arg}"`)); return }
      log(paint(c.bold, `Matches for "${arg}":`))
      hits.forEach((f) => log(`  ${f.replace(/\.md$/, '')}`))
      return
    }
    default:
      err(paint(c.red, `Unknown skill command: ${sub}`))
      err(paint(c.dim, 'Use: omf skill list|add|remove|search'))
      process.exit(1)
  }
}

function skillTemplate(name) {
  return `---
name: ${name}
description: One line describing when an agent should use this skill.
triggers: []
source: manual
---

Steps the agent follows when this skill applies:

1. ...
2. ...
`
}

// ---- notifications ----------------------------------------------------------

async function cmdNotify(opts) {
  const [sub, ...rest] = opts._
  switch (sub) {
    case 'setup': {
      const channel = rest[0]
      log(paint(c.bold, 'Notification setup'))
      log('')
      if (!channel) {
        log('Pick a channel and pass its settings, e.g.:')
        log(paint(c.cyan, '  omf notify setup file --value ./omf.log'))
        log(paint(c.cyan, '  omf notify setup telegram <bot-token> <chat-id>'))
        log(paint(c.cyan, '  omf notify setup discord <webhook-url>'))
        log(paint(c.cyan, '  omf notify setup slack <webhook-url>'))
        log('')
        log(paint(c.dim, 'Or set keys directly: omf config set notifications.slack.webhook <url> --global'))
        return
      }
      const scope = opts.global ? 'global' : 'project'
      if (channel === 'file') {
        const v = rest[1] || (opts._.includes('--value') ? opts._[opts._.indexOf('--value') + 1] : './omf-notify.log')
        setConfigValue(scope, 'notifications.file', v)
      } else if (channel === 'telegram') {
        if (rest.length < 3) { err(paint(c.red, 'Usage: omf notify setup telegram <token> <chatId>')); process.exit(1) }
        setConfigValue(scope, 'notifications.telegram.token', rest[1])
        setConfigValue(scope, 'notifications.telegram.chatId', rest[2])
      } else if (channel === 'discord' || channel === 'slack') {
        if (!rest[1]) { err(paint(c.red, `Usage: omf notify setup ${channel} <webhook-url>`)); process.exit(1) }
        setConfigValue(scope, `notifications.${channel}.webhook`, rest[1])
      } else {
        err(paint(c.red, `Unknown channel: ${channel}`)); process.exit(1)
      }
      log(paint(c.green, `✓ Configured ${channel} notifications (${scope})`))
      log(paint(c.dim, 'Test it with: omf notify test'))
      return
    }
    case 'status': {
      const n = loadConfig().notifications || {}
      const channels = Object.keys(n)
      if (channels.length === 0) { log(paint(c.dim, 'No channels configured. Run: omf notify setup')); return }
      log(paint(c.bold, 'Configured channels:'))
      for (const ch of channels) log(`  ${paint(c.green, '●')} ${ch}`)
      return
    }
    case 'test':
    case 'send': {
      const msg = rest.join(' ') || 'oh-my-freebuff test notification from {{projectName}} ✅'
      const results = await sendNotification(msg)
      if (results.length === 0) { err(paint(c.yellow, 'No channels configured — run: omf notify setup')); process.exit(1) }
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

function cmdDoctor(opts) {
  let ok = true
  const check = (label, pass, detail) => {
    const mark = pass ? paint(c.green, '✓') : paint(c.red, '✗')
    log(`  ${mark} ${label}${detail ? paint(c.dim, '  ' + detail) : ''}`)
    if (!pass) ok = false
  }
  log(paint(c.bold, 'oh-my-freebuff doctor'))
  log('')
  const nodeMajor = Number(process.versions.node.split('.')[0])
  check('Node >= 18', nodeMajor >= 18, `found v${process.versions.node}`)
  const cli = which('freebuff') || which('codebuff') || which('cb')
  check('Freebuff or Codebuff CLI on PATH', !!cli, cli || 'npm i -g freebuff')

  const packDest = installedPackDir(opts)
  const installed = fs.existsSync(packDest)
  check('Pack installed', installed, installed ? packDest : `run: omf install${opts.global ? ' --global' : ''}`)
  if (installed) {
    const typesOk = fs.existsSync(path.join(resolveAgentsDir(opts), 'types', 'agent-definition.ts'))
    check('types/agent-definition present', typesOk, typesOk ? '' : 'run: omf update')
    const count = fs.readdirSync(packDest).filter((f) => f.endsWith('.ts')).length
    check('agent files present', count > 0, `${count} agents`)
  }
  const preset = getConfigValue('modelPreset')
  if (preset) check('model preset', true, preset)
  const nch = Object.keys(loadConfig().notifications || {})
  if (nch.length) check('notifications', true, nch.join(', '))

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
  ${paint(c.cyan, 'setup')}        Install the pack + seed config + knowledge.md (one-shot)
  ${paint(c.cyan, 'install')}      Copy the agent pack into this project's .agents
  ${paint(c.cyan, 'update')}       Re-copy the latest pack (overwrites installed copy)
  ${paint(c.cyan, 'uninstall')}    Remove the installed pack
  ${paint(c.cyan, 'doctor')}       Check your setup

${paint(c.bold, 'Agents & models')}
  ${paint(c.cyan, 'list')}                 List the agents in the pack
  ${paint(c.cyan, 'preset')} [name]        Show or apply a model preset (budget|balanced|premium)

${paint(c.bold, 'Config')}
  ${paint(c.cyan, 'config')}               Print effective config
  ${paint(c.cyan, 'config get')} <key>     Read a config value
  ${paint(c.cyan, 'config set')} <k> <v>   Write a config value (--global for user scope)

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
  -d, --dir <path>   Operate on <path>/.agents
  -f, --force        Overwrite an existing install

${paint(c.bold, 'Examples')}
  omf setup
  omf preset budget
  omf skill add verify-before-done
  omf notify setup slack https://hooks.slack.com/...
  omf notify test`)
}

// ---- dispatch ---------------------------------------------------------------

async function main() {
  const [, , cmd, ...rest] = process.argv
  const opts = parseArgs(rest)
  switch (cmd) {
    case 'install': case 'i': return opts.help ? cmdHelp() : cmdInstall(opts)
    case 'update': case 'up': return cmdInstall({ ...opts, force: true })
    case 'uninstall': case 'rm': return cmdUninstall(opts)
    case 'setup': return cmdSetup(opts)
    case 'list': case 'ls': return cmdList()
    case 'preset': return cmdPreset(opts)
    case 'config': return cmdConfig(opts)
    case 'skill': case 'skills': return cmdSkill(opts)
    case 'notify': return cmdNotify(opts)
    case 'doctor': return cmdDoctor(opts)
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
