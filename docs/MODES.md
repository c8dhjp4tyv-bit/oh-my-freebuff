# Orchestration modes

oh-my-freebuff ships several orchestrator agents. Each is an entry point you
invoke by name inside Freebuff/Codebuff ("use `omf-team` to …"). They coordinate
the specialist agents for you.

Pick by shape of the task:

| Mode | Invoke | Best for | How it works |
| --- | --- | --- | --- |
| **Team** | `omf-team` | Anything non-trivial; the default | Research → design → plan → implement → test → review, looping back on review findings. Parallelizes independent work. |
| **Autopilot** | `omf-autopilot` | Well-defined task, less ceremony | One capable agent drives directly; pulls in researcher/reviewer/debugger only when it helps. |
| **Pipeline** | `omf-pipeline` | Order & auditability matter | Strict sequential stages with an explicit gate between each. No parallelism. |
| **Ultrawork** | `omf-ultrawork` | Many independent edits | Partitions work into non-overlapping slices and runs a swarm of implementers in parallel, then reconciles. |
| **UltraQA** | `omf-ultraqa` | "Get the whole repo green" | Cycles the full quality gate (tests + typecheck + lint + build) to zero failures, adds missing tests. |
| **Ralph** | `omf-ralph` | "Make `<command>` pass" | Persistent verify-fix loop against one check command. Refuses to fake green. |
| **Ralplan** | `omf-ralplan` | High-stakes / ambiguous planning | Generates competing plans, critiques them against each other, synthesizes one. |
| **Advisor** | `omf-advisor` | Judgment calls, second opinions | Asks the same question to three different models and reconciles them. |
| **Deep Interview** | `omf-deep-interview` | Vague request | Socratic questions turn it into a precise, buildable spec. |

## Rules of thumb

- **Not sure?** Use `omf-team`. It scales the pipeline down for small tasks and up for big ones.
- **Vague request?** Start with `omf-deep-interview`, then hand its spec to `omf-team` or `omf-ralplan`.
- **CI is red?** `omf-ralph` for a single check, `omf-ultraqa` for the whole gate.
- **Big mechanical change** (rename everywhere, lint the repo)? `omf-ultrawork`.
- **"Which approach should I take?"** `omf-advisor`.

## Specialists

Orchestrators spawn these; you can also call them directly for a focused task:

`file-picker`, `researcher`, `architect`, `designer`, `planner`, `implementer`,
`refactorer`, `reviewer`, `security-reviewer`, `critic`, `tester`, `debugger`,
`data-scientist`, `docs-writer`, and the advisor panel `advisor-a/b/c`.

See [MODEL-COMPATIBILITY.md](./MODEL-COMPATIBILITY.md) for which model tier each
one runs on and how to change it.
