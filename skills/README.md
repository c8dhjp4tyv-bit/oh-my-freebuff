# Skills

Reusable, named task patterns that agents can invoke with the `skill` tool.
Drop `*.md` skill files here; `omf install` copies this folder into
`.agents/oh-my-freebuff/skills/` alongside the agents.

A skill file is plain markdown with front-matter:

```markdown
---
name: my-skill
description: One line describing when to use this skill.
---

Step-by-step instructions the agent follows when this skill is invoked.
```

See `verify-before-done.md` in this folder for a working example.
