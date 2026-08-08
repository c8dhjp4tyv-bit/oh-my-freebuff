---
name: verify-before-done
description: Before calling a task complete, run the project's real checks and confirm they pass. Use at the end of any change.
---

Don't report a task done on assumption. Run the real checks first:

1. Find the project's verification commands from `knowledge.md` / `AGENTS.md` /
   `package.json` / `Makefile` (tests, typecheck, build, lint).
2. Run each relevant one and read the actual output.
3. If anything fails, fix the cause and re-run. Don't weaken or skip a check to
   make it pass.
4. Only then report done, quoting the command(s) and their passing output.

If a check can't run (missing deps, no network), say so instead of implying it
passed.
