# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. Use
GitHub's [private vulnerability reporting](https://github.com/c8dhjp4tyv-bit/oh-my-freebuff/security/advisories/new)
(Security → Report a vulnerability). Include steps to reproduce and the impact.

We'll acknowledge within a few days and keep you updated until it's resolved.

## Scope

This is a CLI and a pack of agent definitions. The most relevant areas:

- **The `omf` CLI** — filesystem operations (install/update/uninstall, skills),
  config handling, and notification HTTP posts.
- **Secrets** — notification tokens/webhooks live in config. The CLI stores them
  `0600`, redacts them in `omf config`, supports `${ENV_VAR}` references so you
  needn't write them to disk, and `omf doctor` warns if a secret-bearing
  `.freebuff` isn't git-ignored. Report anything that leaks a secret.
- **Path handling** — skill names are validated and confined to the skills root;
  config keys reject prototype-polluting segments. Report any traversal or
  pollution that gets through.

## Out of scope

- The behavior of the models an agent calls, or of the Freebuff/Codebuff runtime
  itself — report those to their respective projects.
- Running untrusted agent definitions you added yourself.
