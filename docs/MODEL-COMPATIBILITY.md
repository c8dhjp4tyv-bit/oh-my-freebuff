# Model routing & compatibility

Every agent is assigned a **tier**, and each **preset** maps tiers to concrete
[OpenRouter model ids](https://openrouter.ai/models). This keeps cost sane: cheap
models do search and simple edits; strong models do design, review and hard
debugging.

- Tiers per agent: [`agents.manifest.json`](../agents.manifest.json)
- Preset definitions: [`models.json`](../models.json)

Switch tiers for the whole pack with one command:

```bash
omf preset budget     # cheapest, open models only
omf preset balanced   # default — strong open models, good value
omf preset premium    # frontier models, highest cost
```

`omf preset <name>` rewrites the `model:` field of every installed agent
according to its tier, and remembers the choice in `.freebuff/omf.jsonc` so
`omf install`/`update` re-applies it.

## Tiers

| Tier | Purpose | Agents |
| --- | --- | --- |
| `fast` | Search, file finding, docs — high volume, low stakes | file-picker, researcher, docs-writer |
| `coding` | Writing and changing code | implementer, tester, refactorer, omf-autopilot |
| `strong` | Design, review, planning, leads | architect, designer, planner, reviewer, security-reviewer, critic, data-scientist, and the omf-team/pipeline/ultrawork/ultraqa/ralplan/advisor/deep-interview leads |
| `reasoning` | Root-cause debugging, persistence loops | debugger, omf-ralph |
| `panel-a/b/c` | The three advisor voices, each a different model | advisor-a, advisor-b, advisor-c |

## Preset → model matrix

| Tier | budget | balanced (default) | premium |
| --- | --- | --- | --- |
| fast | `z-ai/glm-4.7-flash` | `deepseek/deepseek-chat-v3-0324` | `google/gemini-2.5-flash` |
| coding | `qwen/qwen3-coder-flash` | `qwen/qwen3-coder-plus` | `anthropic/claude-sonnet-4.5` |
| strong | `z-ai/glm-4.6` | `z-ai/glm-4.7` | `anthropic/claude-sonnet-4.5` |
| reasoning | `z-ai/glm-4.7-flash` | `deepseek/deepseek-r1-0528` | `openai/gpt-5.1` |
| panel-a | `z-ai/glm-4.6` | `z-ai/glm-4.7` | `anthropic/claude-sonnet-4.5` |
| panel-b | `z-ai/glm-4.7-flash` | `deepseek/deepseek-r1-0528` | `openai/gpt-5.1` |
| panel-c | `qwen/qwen3-coder-flash` | `qwen/qwen3-coder-plus` | `google/gemini-2.5-pro` |

The table is generated from `models.json`. `npm test` asserts the shipped agent
defaults match the `balanced` column.

## Per-agent overrides and custom presets

Presets are a convenience, not a cage. Two config-driven ways to customize —
both survive `omf install` / `omf update` / `omf preset` because they live in
your config, not in the agent files:

**Pin individual agents** with `modelOverrides` (agent id → model id). An
override always wins over the preset's tier model:

```jsonc
// .freebuff/omf.jsonc
{
  "modelPreset": "balanced",
  "modelOverrides": {
    "architect": "anthropic/claude-opus-4.1",
    "implementer": "qwen/qwen3-coder-plus"
  }
}
```

**Define your own preset** with `customPresets` (name → tier map), then apply it
like any built-in:

```jsonc
{
  "customPresets": {
    "mine": {
      "description": "my mix",
      "fast": "google/gemini-2.5-flash-lite",
      "coding": "qwen/qwen3-coder-plus",
      "strong": "z-ai/glm-4.7",
      "reasoning": "deepseek/deepseek-r1-0528",
      "panel-a": "z-ai/glm-4.7",
      "panel-b": "deepseek/deepseek-r1-0528",
      "panel-c": "qwen/qwen3-coder-plus"
    }
  }
}
```

```bash
omf preset mine     # applies your custom preset (+ any modelOverrides on top)
```

Editing an installed agent file's `model:` line directly also works but is
overwritten by the next `omf preset` / `omf update` — use the config for
anything you want to keep. `omf doctor` validates that your configured preset
exists and that every agent still maps to a tier and a model.
