---
name: omf-workflow
description: Carry a coding task from investigation through implementation, tests and review in Freebuff. Use when the user invokes /skill:omf-workflow or asks for an OMF-style workflow.
---

Work through the user's task with the tools available to the current Freebuff agent.

1. Read the relevant project files and reproduce the problem or establish a concrete acceptance check.
2. Make a short plan for work that needs more than one edit. Resolve routine choices from the code and the user's request.
3. Implement the smallest coherent change. Keep independent edits separate if the runtime supports safe parallel work; otherwise work sequentially.
4. Run the project's relevant checks and inspect failures. Fix causes and rerun affected checks.
5. Review the final diff for regressions, accidental edits and unmet requirements. Report what changed and the actual verification result.

Use built-in subagents only when the current Freebuff runtime offers them. This
skill does not install custom agent definitions or change the selected model.
Freebuff free sessions may reject custom agent/model pairs; do not try to
work around that server policy by relabeling an agent.
