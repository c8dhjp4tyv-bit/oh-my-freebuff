# Parity with oh-my-claudecode

This pack ports the ideas of
[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) onto the
Codebuff `.agents` runtime. What carried over, what changed, and what was left
out.

## Ported

| oh-my-claudecode | oh-my-freebuff |
| --- | --- |
| Team staged pipeline | `omf-team` |
| Autopilot | `omf-autopilot` |
| Ralph (persistence loop) | `omf-ralph` |
| Ultrawork (max parallelism) | `omf-ultrawork` |
| UltraQA (quality-gate cycling) | `omf-ultraqa` |
| Ralplan (planning consensus) | `omf-ralplan` |
| Pipeline (sequential) | `omf-pipeline` |
| ccg / `/ask` (multi-model synthesis) | `omf-advisor` + `advisor-a/b/c` |
| deep-interview | `omf-deep-interview` |
| 19+ tiered agents | 26 agents, tiered via `agents.manifest.json` |
| Smart model routing | Tier routing + `budget`/`balanced`/`premium` presets |
| Custom skills + management | `skills/` + `omf skill list/add/remove/search` |
| `.claude/omc.jsonc` config | `.freebuff/omf.jsonc` + user `~/.config/freebuff-omf/config.jsonc` |
| `/setup` | `omf setup` |
| `config set/get` | `omf config set/get` |
| `omc-doctor` | `omf doctor` |
| Notifications (Telegram/Discord/Slack/file) | `omf notify` + `hooks/notify.mjs` |

## Changed

- **Multi-model advice.** oh-my-claudecode shells out to other vendor CLIs
  (Codex, Gemini, Grok). This pack doesn't assume those are installed; the
  advisor panel spawns three agents on three different OpenRouter models instead.
  Same idea, no external CLIs.
- **Tiers.** Rather than Haiku vs Opus specifically, tiers map to whatever a
  preset picks, so `premium` can use Claude/GPT while `budget` stays on open
  models.

## Deterministic orchestration

Most orchestrators are prompt-driven, which is enough for their branching logic.
`omf-ralph` additionally uses Codebuff's `handleSteps` generator: when given a
`verifyCommand` param, the harness re-runs that command each time the agent tries
to finish and refuses to stop while it fails (bounded by a hard iteration cap).
This moves the one guarantee that matters most — "don't declare success on a red
check" — from prompt text into code. `omf-ultraqa` and `omf-pipeline` remain
prompt-driven for now; converting them is a reasonable next step.

## Left out

These depend on Claude Code or tmux specifics with no Codebuff equivalent, so
they aren't included:

- tmux multi-CLI worker panes (`omc team N:provider` spawning real
  `claude`/`codex`/`gemini`/`cursor` processes). Codebuff runs agents in its own
  runtime and orchestrates through `spawn_agents`.
- Claude-native experimental teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
- OpenClaw gateway integration.
- HUD statusline — Codebuff doesn't expose a custom statusline hook. If it adds
  one, this is where it would go.
