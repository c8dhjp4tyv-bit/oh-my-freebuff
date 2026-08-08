#!/usr/bin/env node
// oh-my-freebuff CLI — install and manage the agent pack for Freebuff / Codebuff.
// Zero runtime dependencies on purpose: it's just filesystem plumbing.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACK_ROOT = path.resolve(__dirname, '..')
const PACK_NAME = 'oh-my-freebuff'

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (color, s) => (supportsColor ? color + s + c.reset : s)
const log = (...a) => console.log(...a)
const err = (...a) => console.error(...a)

function readPackVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACK_ROOT, 'package.json'), 'utf8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** All agent files shipped in the pack (agents/*.ts). */
function listPackAgents() {
  const dir = path.join(PACK_ROOT, 'agents')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .sort()
}

/** Parse `key`/`--key value`/`--flag` style args after the command. */
function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--global' || a === '-g') opts.global = true
    else if (a === '--force' || a === '-f') opts.force = true
    else if (a === '--dir' || a === '-d') opts.dir = argv[++i]
    else if (a.startsWith('--dir=')) opts.dir = a.slice('--dir='.length)
    else if (a === '--help' || a === '-h') opts.help = true
    else opts._.push(a)
  }
  return opts
}

/** Resolve the target .agents directory. */
function resolveAgentsDir(opts) {
  if (opts.dir) return path.resolve(process.cwd(), opts.dir, '.agents')
  const base = opts.global ? os.homedir() : process.cwd()
  return path.join(base, '.agents')
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

// ---- commands ---------------------------------------------------------------

function cmdInstall(opts) {
  const agentsDir = resolveAgentsDir(opts)
  const packDest = path.join(agentsDir, PACK_NAME)
  const typesDest = path.join(agentsDir, 'types')

  if (fs.existsSync(packDest) && !opts.force) {
    err(paint(c.yellow, `! ${PACK_NAME} is already installed at ${packDest}`))
    err(paint(c.dim, '  Re-run with --force to overwrite (or use: omf update).'))
    process.exit(1)
  }

  // Lay out:  <target>/.agents/oh-my-freebuff/*.ts  +  <target>/.agents/types/*
  // Agents import '../types/agent-definition', which resolves to .agents/types.
  fs.rmSync(packDest, { recursive: true, force: true })
  copyDir(path.join(PACK_ROOT, 'agents'), packDest)
  copyDir(path.join(PACK_ROOT, 'types'), typesDest)

  const skillsSrc = path.join(PACK_ROOT, 'skills')
  if (fs.existsSync(skillsSrc)) {
    copyDir(skillsSrc, path.join(packDest, 'skills'))
  }

  const agents = listPackAgents()
  log(paint(c.green, `✓ Installed ${PACK_NAME} v${readPackVersion()}`))
  log(`  ${paint(c.dim, 'location:')} ${packDest}`)
  log(`  ${paint(c.dim, 'agents:')}   ${agents.length}`)
  log('')
  log('Next: run Freebuff in this project and pick an orchestrator, e.g.')
  log(paint(c.cyan, '  freebuff'))
  log(paint(c.dim, '  then: "use omf-team to <your task>"'))
}

function cmdUninstall(opts) {
  const agentsDir = resolveAgentsDir(opts)
  const packDest = path.join(agentsDir, PACK_NAME)
  if (!fs.existsSync(packDest)) {
    log(paint(c.yellow, `Nothing to remove — ${PACK_NAME} is not installed at ${packDest}`))
    return
  }
  fs.rmSync(packDest, { recursive: true, force: true })
  log(paint(c.green, `✓ Removed ${packDest}`))
  log(paint(c.dim, '  (Left .agents/types in place; it may be shared with other agents.)'))
}

function cmdList() {
  const agents = listPackAgents()
  log(paint(c.bold, `oh-my-freebuff v${readPackVersion()} — ${agents.length} agents`))
  log('')
  const orchestrators = agents.filter((a) => a.startsWith('omf-'))
  const specialists = agents.filter((a) => !a.startsWith('omf-'))
  const describe = (file) => {
    const id = file.replace(/\.ts$/, '')
    const src = fs.readFileSync(path.join(PACK_ROOT, 'agents', file), 'utf8')
    const m = src.match(/\*\s+\S.*?—\s*(.+)/)
    return { id, note: m ? m[1].trim() : '' }
  }
  if (orchestrators.length) {
    log(paint(c.cyan, 'Orchestrators') + paint(c.dim, ' (entry points)'))
    for (const f of orchestrators) {
      const { id, note } = describe(f)
      log(`  ${paint(c.bold, id.padEnd(16))} ${paint(c.dim, note)}`)
    }
    log('')
  }
  log(paint(c.cyan, 'Specialists') + paint(c.dim, ' (spawned by orchestrators, or use directly)'))
  for (const f of specialists) {
    const { id, note } = describe(f)
    log(`  ${paint(c.bold, id.padEnd(16))} ${paint(c.dim, note)}`)
  }
}

function which(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter)
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, bin + ext)
      try {
        fs.accessSync(p, fs.constants.X_OK)
        return p
      } catch {
        /* keep looking */
      }
    }
  }
  return null
}

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
  check(`Node >= 18`, nodeMajor >= 18, `found v${process.versions.node}`)

  const freebuff = which('freebuff')
  const codebuff = which('codebuff') || which('cb')
  check('Freebuff or Codebuff CLI on PATH', !!(freebuff || codebuff),
    freebuff || codebuff || 'install with: npm i -g freebuff')

  const agentsDir = resolveAgentsDir(opts)
  const packDest = path.join(agentsDir, PACK_NAME)
  const installed = fs.existsSync(packDest)
  check(`Pack installed`, installed, installed ? packDest : `run: omf install${opts.global ? ' --global' : ''}`)

  if (installed) {
    const typesOk = fs.existsSync(path.join(agentsDir, 'types', 'agent-definition.ts'))
    check('types/agent-definition present', typesOk, typesOk ? '' : 'run: omf update')
    const count = fs
      .readdirSync(packDest)
      .filter((f) => f.endsWith('.ts')).length
    check('agent files present', count > 0, `${count} agents`)
  }

  log('')
  log(ok ? paint(c.green, 'All good.') : paint(c.yellow, 'Some checks failed — see above.'))
  if (!ok) process.exit(1)
}

function cmdHelp() {
  log(`${paint(c.bold, 'oh-my-freebuff')} ${paint(c.dim, 'v' + readPackVersion())} — multi-agent pack for Freebuff / Codebuff

${paint(c.bold, 'Usage')}
  omf <command> [options]

${paint(c.bold, 'Commands')}
  ${paint(c.cyan, 'install')}      Copy the agent pack into this project's .agents directory
  ${paint(c.cyan, 'update')}       Re-copy the latest pack (overwrites the installed copy)
  ${paint(c.cyan, 'uninstall')}    Remove the installed pack
  ${paint(c.cyan, 'list')}         List the agents in the pack
  ${paint(c.cyan, 'doctor')}       Check your setup
  ${paint(c.cyan, 'help')}         Show this help
  ${paint(c.cyan, 'version')}      Print the version

${paint(c.bold, 'Options')}
  -g, --global       Target ~/.agents instead of ./.agents
  -d, --dir <path>   Install into <path>/.agents
  -f, --force        Overwrite an existing install
  -h, --help         Show help

${paint(c.bold, 'Examples')}
  omf install                 ${paint(c.dim, '# into ./.agents')}
  omf install --global        ${paint(c.dim, '# into ~/.agents (available everywhere)')}
  omf install --dir ../app    ${paint(c.dim, '# into ../app/.agents')}
  omf list
  omf doctor`)
}

// ---- dispatch ---------------------------------------------------------------

function main() {
  const [, , cmd, ...rest] = process.argv
  const opts = parseArgs(rest)

  switch (cmd) {
    case 'install':
    case 'i':
      if (opts.help) return cmdHelp()
      return cmdInstall(opts)
    case 'update':
    case 'up':
      return cmdInstall({ ...opts, force: true })
    case 'uninstall':
    case 'rm':
      return cmdUninstall(opts)
    case 'list':
    case 'ls':
      return cmdList()
    case 'doctor':
      return cmdDoctor(opts)
    case 'version':
    case '--version':
    case '-v':
      return log(readPackVersion())
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return cmdHelp()
    default:
      err(paint(c.red, `Unknown command: ${cmd}`))
      err(paint(c.dim, 'Run `omf help` for usage.'))
      process.exit(1)
  }
}

try {
  main()
} catch (e) {
  err(paint(c.red, `Error: ${e.message}`))
  process.exit(1)
}
