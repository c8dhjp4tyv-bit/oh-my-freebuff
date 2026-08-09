# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[SemVer](https://semver.org/).

## [0.2.4]

Release/showcase polish — no code behavior change.

### Added

- README status badges (CI, npm version, Node, license).
- Community-health files: `CONTRIBUTING.md`, `SECURITY.md`, GitHub issue
  templates (bug / feature) and a pull-request template.

## [0.2.3]

Fourth review pass. Runtime-compat proven in CI; ralph failure semantics; preset refresh.

### Fixed

- **Verified real Codebuff runtime compatibility.** Running the pack through the
  actual `@codebuff/sdk` loader surfaced that the smoke test read the wrong return
  shape *and* two files broke the loader. All 26 agents now load with **zero
  validation errors**, and:
  - the installer no longer copies `hooks/` into `.agents/` (the loader tried to
    parse the hook `.mjs` as an agent),
  - the type shim dropped its runtime `export default` of a type (a dangling value
    reference the loader hit).
- **ralph never mistakes an exhausted loop for green.** Every completion attempt
  is verified; success (exit 0) and "still failing after maxIterations" are now
  separate exits, the latter recording an explicit `set_output` failure instead
  of falling through.

### Added

- **The Codebuff SDK smoke test runs in CI** as its own `codebuff-compat` job
  (`@codebuff/sdk@latest` → `npm run smoke`), so a Codebuff change that breaks
  agent/skill discovery is caught here, not in a user's terminal.
- **Model-id validity is enforced against the SDK's model list** — every id in
  `models.json` must be one the installed SDK recognizes, so a stale/typo'd slug
  fails CI.

### Changed

- `premium` preset's heavy tiers upgraded to `anthropic/claude-opus-4.6` (the
  strongest model this SDK version validates); "frontier" wording softened with a
  re-benchmark note.

## [0.2.2]

Third review pass. Consistency, doctor depth, and durable model customization.

### Fixed

- **Node version is consistent at `>=20`** across `package.json`, the README, and
  `omf doctor` (previously the README and doctor still said 18).
- **`--dir` with no path fails fast** ("--dir requires a path") instead of
  silently falling back to the current directory.
- **`package-lock.json` tracks the current version.**

### Added

- **Durable model customization via config**, honored by `install`/`update`/`preset`:
  - `modelOverrides` — pin individual agents (agent id → model id); an override
    beats the preset's tier model.
  - `customPresets` — define your own named tier→model preset and `omf preset <name>` it.
  Editing installed agent files still works but is overwritten by the next
  `preset`/`update`; config-based customization persists.
- **`omf doctor` validates model routing**: the configured preset actually
  exists, every agent maps to a manifest tier, no orphan manifest entries, and
  every agent has a model id — so a typo'd preset no longer reports green.

### Changed

- **`security-reviewer` is now genuinely read-only** (no `run_terminal_command`);
  it audits by reading. `reviewer` keeps terminal access but is documented and
  instructed as non-editing / read-only-inspection (git diff, tests) — never
  mutating the repo.

## [0.2.1]

Second review pass. Closes the safe install/update/uninstall gaps.

### Fixed

- **`uninstall`/`update` can no longer touch a user's skill.** The installer
  records what it created and each file's hash in `.freebuff/omf-managed.json`.
  A skill is only refreshed or removed if the pack installed it *and* the user
  hasn't modified it since — a user's own skill (even one that shares a shipped
  name) is never overwritten or deleted, `--force` included.
- **`omf config get <secret-key>` no longer prints the secret.** Redaction now
  keys off the requested path, so `config get notifications.telegram.token` is
  masked unless `--show-secrets` is passed. Regression-tested.
- **`omf-ralph` verification is actually deterministic.** The loop appends an
  exit-code sentinel to the command and stops only on a real exit 0, instead of
  pattern-matching output (so "0 failures" no longer reads as a failure).
  `maxIterations` is validated as a positive integer.
- **Malformed config no longer causes silent data loss.** Writes read the
  existing file strictly (missing → `{}`, malformed → abort) and are written
  atomically (temp + rename) at `0600`. Prototype-polluting key segments
  (`__proto__`, `constructor`, `prototype`) are rejected.

### Changed

- Skill-name validation matches Codebuff's rule (1–64 chars, lowercase
  alphanumeric segments, single non-leading/trailing hyphens) so a name the CLI
  accepts is one Codebuff accepts.
- `omf-pipeline` spawns one implementer per plan task with a gate between each,
  resolving the conflict with the implementer's one-task contract.
- Notification HTTP posts have a 10s timeout.
- Node support is `>=20`; CI runs 20/22/24 with a lockfile and `npm ci`.
- `models.json` carries `lastReviewed` / `costClass` metadata to make preset
  drift (especially `premium`) a maintained thing.

### Added

- Opt-in runtime smoke test (`npm run smoke`) that loads the installed agents and
  skills through the real `@codebuff/sdk` loaders (`loadLocalAgents`/`loadSkills`).
- Unit + end-to-end tests for every fix above (config fail-safe, proto-guard,
  secret-path redaction, skill-name rules, receipt hashing, and ownership-safe
  uninstall/update). Suite is now 163 tests.

## [0.2.0]

Hardening pass toward a install-anywhere release. Addresses an external review.

### Fixed

- **Skills now use Codebuff's native layout.** Skills install to
  `.agents/skills/<name>/SKILL.md` (discoverable as `/skill:<name>`) instead of
  flat files nested under the pack. Previously they were not discovered.
- **Installer no longer overwrites `.agents/types`.** The type shim is written
  only when no `agent-definition.ts` already exists, so a user's or Codebuff's
  own types are never clobbered.
- **`omf skill remove` path traversal.** All skill names go through a single
  `normalizeSkillName` gate that rejects slashes, `..`, and empty names, and the
  resolved path is asserted to stay within the skills directory.
- **`--dir` / `--global` consistency.** Every command now resolves a single
  `ProjectContext`, so config, `knowledge.md`, presets, and notifications all act
  on the intended target rather than mixing in the current working directory.

### Added

- **Secret hygiene.** `omf config` redacts token/webhook/password values by
  default (`--show-secrets` to reveal); config files are written `0600`;
  notification secrets can reference environment variables (`${VAR}` / `env:VAR`);
  `omf doctor` warns when a project config holding secrets isn't git-ignored.
- **Deterministic ralph loop.** `omf-ralph` accepts a `verifyCommand` param and
  uses `handleSteps` to enforce "don't stop while the check fails" in code, with
  a hard iteration cap. Without the param it stays prompt-driven.
- **`spawnerPrompt` on every specialist**, so orchestrators have explicit
  guidance on when to spawn each one.
- **End-to-end CLI tests** run the real binary against fixture projects
  (types-survive-install, skill traversal refused, `--dir` isolation, secret
  redaction), plus a syntax check on the JS entrypoints. Suite is now 153 tests.
- **CI** on Node 18/20/22 (typecheck + tests).

## [0.1.0]

First release. Multi-agent pack for Freebuff / Codebuff.

- 9 orchestration modes and 17 specialist agents (26 agent files total).
- Tier-based model routing with `budget` / `balanced` / `premium` presets.
- `omf` CLI: setup, install/update/uninstall, list, preset, config, skill,
  notify, doctor.
- Notifications (Telegram / Discord / Slack / file) and a standalone notify hook.
- Docs: modes guide, model-compatibility matrix, parity with oh-my-claudecode.
