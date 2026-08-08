---
name: verify-before-done
description: Before claiming a task is complete, actually run the project's checks and confirm they pass. Use at the end of any change.
---

Do not report a task as done on assumption. Run the real checks first:

1. Identify the project's verification commands from `knowledge.md` / `AGENTS.md`
   / `package.json` / `Makefile` (tests, typecheck, build, lint).
2. Run each relevant one with `run_terminal_command` and read the ACTUAL output.
3. If anything fails, fix the cause and re-run — do not weaken or skip a check to
   make it pass.
4. Only then report done, quoting the real command(s) and their passing output.

If a check can't be run (missing deps, no network), say so explicitly instead of
implying it passed.
