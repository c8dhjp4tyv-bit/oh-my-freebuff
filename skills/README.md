# Skills

Each skill is a directory with a `SKILL.md` file, matching Codebuff's discovery
layout. `omf install` copies these into the project's shared skills directory:

```
.agents/skills/<name>/SKILL.md
```

Codebuff discovers them from `.agents/skills/` (and `~/.agents/skills/` when
installed globally) and exposes each as `/skill:<name>`.

`SKILL.md` is markdown with front-matter:

```markdown
---
name: my-skill
description: One line describing when to use this skill.
---

Instructions the agent follows when this skill applies.
```

Manage skills with the CLI:

```
omf skill list
omf skill add <name>
omf skill remove <name>
omf skill search <query>
```

See `verify-before-done/SKILL.md` for a working example.
