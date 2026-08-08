# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow
[SemVer](https://semver.org/).

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
