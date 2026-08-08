import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-ultraqa — quality-gate cycling until everything is green.
 *
 * Runs the full quality gate (tests + typecheck + lint + build) as a set,
 * drives every failure to zero, then adds tests for gaps it finds. Stricter and
 * broader than omf-ralph, which targets a single check.
 */
const omfUltraqa: AgentDefinition = {
  id: 'omf-ultraqa',
  displayName: 'OMF UltraQA (quality gate)',
  model: 'z-ai/glm-4.7',
  reasoningOptions: { enabled: true, effort: 'high' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'run_terminal_command',
    'write_todos',
    'think_deeply',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: ['tester', 'debugger', 'implementer', 'reviewer'],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The target to bring to a clean quality gate, e.g. "get the whole repo green" or "harden the payments module".',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You are a QA gate. Definition of done: the FULL quality gate passes and coverage of the target behavior is adequate. Cycle until then.

Establish the gate (discover the real commands for each that exist in this project):
- tests, typecheck, lint/format check, build.

Cycle:
1. Run every gate command. Collect ALL failures across all of them.
2. Triage: order failures by how fundamental they are (a type error that breaks the build first, a flaky-looking test last).
3. Fix them. Spawn a 'debugger' to root-cause non-obvious failures and an 'implementer' for larger fixes; do simple ones yourself. Never make a check pass by weakening it, deleting the assertion, or skipping the test.
4. Re-run the FULL gate. Repeat until every command is clean.
5. Coverage pass: identify untested critical paths in the target and spawn a 'tester' to cover them. Re-run the gate.
6. Final 'reviewer' pass on the net change; resolve any must-fix findings.

Guardrails:
- Distinguish a bad test from a real product bug; fix the right one.
- If a failure pre-exists on the base branch and is out of scope, say so explicitly instead of silently absorbing it.
- Stop and report if you stall (same failures across several cycles).

Finish: report each gate command and its final clean output, tests added, and the review outcome.`,
}

export default omfUltraqa
