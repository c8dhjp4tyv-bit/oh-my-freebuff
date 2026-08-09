# oh-my-freebuff

[![CI](https://github.com/c8dhjp4tyv-bit/oh-my-freebuff/actions/workflows/ci.yml/badge.svg)](https://github.com/c8dhjp4tyv-bit/oh-my-freebuff/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/oh-my-freebuff)](https://www.npmjs.com/package/oh-my-freebuff)
[![node](https://img.shields.io/node/v/oh-my-freebuff)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Multi-agent orchestration for [Freebuff](https://freebuff.com) and
[Codebuff](https://codebuff.com). It's a pack of agents you drop into a project's
`.agents` folder: a set of specialists (researcher, implementer, reviewer, and so
on) plus orchestrators that coordinate them through a research → plan → build →
review pipeline. Inspired by
[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), built for
the Codebuff agent runtime.

Freebuff is a free coding agent built on Codebuff, and Codebuff loads agent
definitions from a `.agents/` directory. This pack uses that to give you a team
of agents instead of one, with model routing that keeps cheap models on search
and simple edits and saves the strong models for design, review, and debugging.

## Install

```bash
npx oh-my-freebuff install     # copy the pack into ./.agents
```

Or install the CLI:

```bash
npm i -g oh-my-freebuff
omf setup                      # install + write config + a knowledge.md stub
```

Run Freebuff in the project and call an orchestrator by name:

```
freebuff
> use omf-team to add pagination to the users API and cover it with tests
```

`omf doctor` checks your setup.

## Orchestrators

Pick one by the shape of the task. Full guide in [docs/MODES.md](./docs/MODES.md).

| Agent | For |
| --- | --- |
| `omf-team` | The default. Research, design, plan, implement, test, review, looping on review findings. |
| `omf-autopilot` | A defined task, less overhead. One agent drives and calls helpers when it needs them. |
| `omf-pipeline` | Strict sequential stages with a gate between each. When order matters. |
| `omf-ultrawork` | Many independent edits in parallel: rename everywhere, apply a rule across the repo. |
| `omf-ultraqa` | Drive the whole quality gate (tests, typecheck, lint, build) to zero failures. |
| `omf-ralph` | Loop on one check command until it passes. Won't report green on a red check. |
| `omf-ralplan` | Generate competing plans, critique them against each other, merge into one. |
| `omf-advisor` | A second opinion: the same question sent to three different models, reconciled. |
| `omf-deep-interview` | Turn a vague request into a spec with a few pointed questions. |

## Specialists

Orchestrators spawn these. You can also call one directly for a focused job.

| Agent | Role |
| --- | --- |
| `file-picker` | Shortlist the files that matter for a task. |
| `researcher` | Read-only context gathering across the code and web. |
| `architect` | Technical design before a large change. |
| `designer` | UI and API-surface design. |
| `planner` | Turn a goal into an ordered, checkable task list. |
| `implementer` | Write the code for one scoped task. |
| `refactorer` | Restructure without changing behavior, checked against tests. |
| `reviewer` | Review a change for correctness; reports, doesn't edit. |
| `security-reviewer` | Look for exploitable issues with concrete attack scenarios. |
| `critic` | Push back on the approach, not the syntax. |
| `tester` | Write and run tests, report the real result. |
| `debugger` | Find the root cause before changing code. |
| `data-scientist` | Data exploration, queries, and metrics grounded in the data. |
| `docs-writer` | READMEs, comments, changelogs. |
| `advisor-a/b/c` | Three voices of the advisor panel, each on a different model. |

## Model presets

Each agent has a tier. A preset maps tiers to real
[OpenRouter models](https://openrouter.ai/models). Switch the whole pack's cost
profile in one command:

```bash
omf preset budget      # open models only, cheapest
omf preset balanced    # default
omf preset premium     # Claude / GPT / Gemini, most expensive
```

`omf preset` rewrites each installed agent's `model:` line by tier and records
the choice, so `install` and `update` re-apply it. The tier→model table lives in
[docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md). Every agent is a
plain file, so you can also set one model by hand.

## CLI

```
Setup
  omf setup                 Install, write config, add a knowledge.md stub
  omf install               Copy the pack into ./.agents
  omf update                Re-copy the pack (keeps your preset)
  omf uninstall             Remove the pack
  omf doctor                Check the setup

Agents & models
  omf list                  List the agents
  omf preset [name]         Show or apply a model preset

Config
  omf config                Print the effective config
  omf config get <key>      Read a value
  omf config set <k> <v>    Write a value (--global for user scope)

Skills
  omf skill list            List skills
  omf skill add <name>      Scaffold a skill
  omf skill remove <name>   Delete a skill
  omf skill search <q>      Search skills

Notifications
  omf notify setup <ch>     Configure telegram | discord | slack | file
  omf notify test           Send a test message
  omf notify status         Show configured channels

Options
  -g, --global              Target ~/.agents and user-scope config
  -d, --dir <path>          Operate on <path>/.agents
  -f, --force               Overwrite an existing install
```

## Notifications

Get a ping when a long run finishes. Configure a channel, then call
`hooks/notify.mjs` from wherever your workflow signals completion.

Prefer keeping the secret in an environment variable rather than shell history:

```bash
export SLACK_WEBHOOK=https://hooks.slack.com/services/...
omf notify setup slack '${SLACK_WEBHOOK}'      # stored as a reference, resolved at send
omf notify test
```

Passing the value directly also works (`omf notify setup slack <url>`), but it
lands in your shell history. Channels: Telegram, Discord, Slack, and a local
file. Secrets are stored `0600` and redacted in `omf config`. Messages support
`{{projectName}}` and other variables.

## Skills

Skills are reusable, named instructions an agent can invoke. They install to the
Codebuff-native location and are discovered as `/skill:<name>`:

```
.agents/skills/<name>/SKILL.md
```

```bash
omf skill add my-check      # scaffolds .agents/skills/my-check/SKILL.md
omf skill list
omf skill search verify
omf skill remove my-check
```

## Config & secrets

Config lives in `.freebuff/omf.jsonc` (project) or `~/.config/freebuff-omf/config.jsonc`
(`--global`). Notification tokens and webhooks are secrets, so:

- `omf config` redacts them by default; pass `--show-secrets` to reveal.
- Config files are written with `0600` permissions.
- A value can reference the environment instead of storing the secret inline:
  `omf notify setup slack '${SLACK_WEBHOOK}'`.
- `omf doctor` warns if a project config holding secrets isn't git-ignored.

## How orchestration works

Orchestrators spawn specialists with Codebuff's `spawn_agents` tool. Each
specialist starts with only the brief it's handed, so the orchestrator passes
down the files, constraints, and definition of done. Independent work runs in
parallel; edits to the same file are serialized.

```
omf-team
  ├─ file-picker / researcher   shortlist and read the relevant code
  ├─ architect / designer       decide the approach
  ├─ planner                    ordered task list
  ├─ implementer × N            the edits (parallel where independent)
  ├─ tester / debugger          make it work
  └─ reviewer                   must-fix loop, then done
```

## What goes where

After install:

- **Pack agents** live under `.agents/oh-my-freebuff/` (fully owned by the pack).
- **Skills** install to the shared `.agents/skills/<name>/SKILL.md`.
- **The type shim** goes to `.agents/types/agent-definition.ts` — only if you
  don't already have one; an existing (or Codebuff-generated) one is left alone.

## Customize

- Change a model durably: set `modelOverrides` (per agent) or `customPresets` in
  `.freebuff/omf.jsonc` — these survive `install`/`update`/`preset`. See
  [docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md). Editing an agent
  file's `model:` line works too but is overwritten by the next `omf preset`.
- Change behavior: edit the agent's `instructionsPrompt`.
- Add an agent: drop a `.ts` file that exports an `AgentDefinition` and add its
  id to an orchestrator's `spawnableAgents`.

> **Note on `omf update`:** it replaces the files in `.agents/oh-my-freebuff/`,
> so edits made directly to installed pack agents are overwritten. Keep durable
> changes in `agents.manifest.json` / `models.json`, or copy an agent to a new
> id. Your **skills** are safe — `update` and `uninstall` only touch skills the
> pack installed and you haven't modified (tracked in `.freebuff/omf-managed.json`).

## Requirements

- Node.js ≥ 20 for the `omf` CLI.
- The Freebuff or Codebuff CLI to run the agents (`npm i -g freebuff`).

## Develop

```bash
npm install       # dev only: TypeScript for typechecking
npm run typecheck
npm test
```

## Docs

- [docs/MODES.md](./docs/MODES.md) — the orchestration modes
- [docs/MODEL-COMPATIBILITY.md](./docs/MODEL-COMPATIBILITY.md) — tiers, presets, model table
- [docs/PARITY.md](./docs/PARITY.md) — what's ported from oh-my-claudecode and what isn't
- [CHANGELOG.md](./CHANGELOG.md) — release notes

## License

MIT. Not affiliated with Freebuff or Codebuff; it builds on their `.agents`
extension point.
