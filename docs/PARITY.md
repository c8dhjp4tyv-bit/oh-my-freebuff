# Parity with oh-my-claudecode

oh-my-freebuff ports the ideas of
[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) onto the
Freebuff / Codebuff `.agents` runtime. This page tracks what carried over, what
was adapted, and what was intentionally left out (and why).

## Ported ✅

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
| deep-interview (Socratic clarification) | `omf-deep-interview` |
| 19+ specialized agents with tier variants | 26 agents, tiered via `agents.manifest.json` |
| Smart model routing (Haiku↔Opus) | Tier routing + `budget/balanced/premium` presets |
| Custom skills system + management | `skills/` + `omf skill list/add/remove/search` |
| Config file (`.claude/omc.jsonc`) | `.freebuff/omf.jsonc` + user `~/.config/freebuff-omf/config.jsonc` |
| `/setup` | `omf setup` |
| `config set/get` | `omf config set/get` |
| `omc-doctor` | `omf doctor` |
| Notifications (Telegram/Discord/Slack/file) | `omf notify` + `hooks/notify.mjs` |
| Stop-callback hook | `hooks/notify.mjs` (usable as a completion callback) |

## Adapted 🔁

- **Multi-model advice.** oh-my-claudecode shells out to *other vendor CLIs*
  (Codex, Gemini, Grok). We don't assume those are installed; instead the advisor
  panel spawns three agents pinned to three different OpenRouter models. Same
  "get a cross-model second opinion" outcome, no external CLIs.
- **Model tiers.** Instead of Haiku/Opus specifically, tiers map to whatever
  models a preset chooses — so `premium` can use Claude/GPT while `budget` stays
  on open models.

## Intentionally out of scope 🚫

These are tied to Claude Code / tmux specifics and don't have a meaningful
Freebuff equivalent, so they're documented rather than faked:

- **tmux multi-CLI worker orchestration** (`omc team N:provider` spawning real
  `claude`/`codex`/`gemini`/`cursor` panes). Freebuff runs agents in its own
  runtime; we orchestrate via Codebuff's `spawn_agents`, not tmux panes.
- **Claude-native experimental teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
  Claude-Code-only flag.
- **OpenClaw gateway integration.** External service specific to the OMC ecosystem.
- **HUD statusline.** Codebuff/Freebuff doesn't expose a custom-statusline hook
  the way Claude Code does; when/if it does, this is the natural place to add it.

If Freebuff/Codebuff grows the hooks these need, they become straightforward to
add — PRs welcome.
