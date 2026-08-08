# oh-my-freebuff

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
`hooks/notify.mjs` from wherever your workflow signals completion:

```bash
omf notify setup slack https://hooks.slack.com/services/...
omf notify setup telegram <bot-token> <chat-id>
omf notify setup file ./omf-notify.log
omf notify test
```

Channels: Telegram, Discord, Slack, and a local file. Messages support
`{{projectName}}` and other variables.

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

## Customize

After install, everything is a file under `.agents/oh-my-freebuff/`:

- Change a model: edit the `model:` line in an agent file (a later `omf preset`
  will overwrite it — to make it stick, edit `agents.manifest.json` or
  `models.json`).
- Change behavior: edit the agent's `instructionsPrompt`.
- Add an agent: drop a `.ts` file that exports an `AgentDefinition` and add its
  id to an orchestrator's `spawnableAgents`.

## Requirements

- Node.js ≥ 18 for the `omf` CLI.
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

## License

MIT. Not affiliated with Freebuff or Codebuff; it builds on their `.agents`
extension point.
