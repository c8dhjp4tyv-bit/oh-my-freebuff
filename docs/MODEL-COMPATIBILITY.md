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
omf preset premium    # highest-capability preset, highest cost
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
| strong | `z-ai/glm-4.6` | `z-ai/glm-4.7` | `anthropic/claude-opus-4.6` |
| reasoning | `z-ai/glm-4.7-flash` | `deepseek/deepseek-r1-0528` | `anthropic/claude-opus-4.6` |
| panel-a | `z-ai/glm-4.6` | `z-ai/glm-4.7` | `anthropic/claude-opus-4.6` |
| panel-b | `z-ai/glm-4.7-flash` | `deepseek/deepseek-r1-0528` | `openai/gpt-5.1` |
| panel-c | `qwen/qwen3-coder-flash` | `qwen/qwen3-coder-plus` | `google/gemini-2.5-pro` |

The table mirrors `models.json`. `npm test` asserts the shipped agent defaults
match the `balanced` column, and the Codebuff SDK smoke job checks that the model
ids are recognized by the SDK version under test.

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

Unknown agent ids in `modelOverrides` are rejected instead of being silently
ignored.

**Define your own preset** with `customPresets`, then apply it like any built-in.
A custom preset is an overlay: omitted tiers inherit from `balanced` unless you
set `extends` to another built-in/custom preset.

```jsonc
{
  "customPresets": {
    "mine": {
      "description": "balanced, but a different strong model",
      "strong": "some-provider/strong-model"
    },
    "my-premium": {
      "extends": "premium",
      "coding": "some-provider/coding-model"
    }
  }
}
```

```bash
omf preset mine        # balanced + the strong override
omf preset my-premium  # premium + the coding override
```

Custom presets may extend other custom presets. Unknown parents, inheritance
cycles, malformed preset objects, or a resolved preset that still lacks a tier
are rejected. A custom preset with the same name as a built-in refines that
built-in unless it explicitly chooses another `extends` parent.

Editing an installed agent file's `model:` line directly also works but is
overwritten by the next `omf preset` / `omf update` — use the config for
anything you want to keep. `omf doctor` validates config parsing, preset
inheritance, the selected preset, model override targets, and the pack's agent ↔
tier integrity.
