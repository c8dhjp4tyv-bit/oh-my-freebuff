# Contributing

Thanks for helping improve oh-my-freebuff.

## Setup

```bash
git clone https://github.com/c8dhjp4tyv-bit/oh-my-freebuff
cd oh-my-freebuff
npm ci
```

The `omf` CLI has no runtime dependencies; TypeScript is a dev dependency for
typechecking the agent definitions.

## Before you open a PR

```bash
npm run typecheck   # agent definitions type-check against the shim
npm test            # unit + end-to-end CLI tests
```

If your change touches how agents or skills are loaded, also run the real
Codebuff runtime check:

```bash
npm i --no-save @codebuff/sdk
npm run smoke
```

CI runs the first two on Node 20/22/24 and the smoke test as a separate job, so a
green PR is a working PR.

## What goes where

- `agents/*.ts` — one agent per file, exporting an `AgentDefinition`. Add new
  agents to `agents.manifest.json` (id → tier); a test enforces that mapping.
- `bin/` — the CLI (`omf.mjs`) and its helpers (`lib.mjs`). Keep it dependency-free.
- `skills/<name>/SKILL.md` — shipped skills (Codebuff's discovery layout).
- `models.json` — preset → model routing.
- `test/` — `*.test.mjs` run by `npm test`; `smoke-codebuff.mjs` is opt-in.

## Conventions

- Match the surrounding style; keep diffs tight and scoped.
- Add or update a test for any behavior change — the E2E tests exist because a
  few real bugs shipped without them.
- Update `CHANGELOG.md` under an unreleased/next version heading.
- Agent prompts: be concrete and imperative. Read a few existing agents first.

## Reporting bugs / proposing features

Open an issue using the templates. For anything security-related, see
[SECURITY.md](./SECURITY.md) instead of filing a public issue.
