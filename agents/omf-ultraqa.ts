import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-ultraqa — quality-gate cycling until everything is green.
 *
 * Runs the full quality gate (tests + typecheck + lint + build) as a set,
 * drives every failure to zero, then adds tests for gaps it finds. Stricter and
 * broader than omf-ralph, which targets a single check.
 *
 * When gateCommands are supplied, handleSteps enforces the final gate in code:
 * every completion attempt re-runs every command and cannot finish green while
 * any command is still failing.
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
    params: {
      type: 'object',
      properties: {
        gateCommands: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional exact gate commands to enforce deterministically on every completion attempt, e.g. ["npm test", "npm run typecheck", "npm run build"].',
        },
        maxCycles: {
          type: 'number',
          description: 'Maximum harness-enforced verify/fix cycles when gateCommands are supplied (default 6).',
        },
      },
    },
  },
  outputMode: 'last_message',
  handleSteps: function* ({ params }) {
    const commands = Array.isArray(params?.gateCommands)
      ? params.gateCommands.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
      : []
    let max = Number(params?.maxCycles)
    if (!Number.isInteger(max) || max < 1) max = 6
    let cycles = 0

    while (true) {
      const { stepsComplete } = yield 'STEP'
      if (!stepsComplete) continue
      if (commands.length === 0) return

      cycles++
      const failed: string[] = []
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i]
        const marker = `OMF_ULTRAQA_EXIT_${i}=`
        const wrapped = `${cmd}; code=$?; printf "\\n${marker}%s\\n" "$code"`
        const { toolResult } = yield {
          toolName: 'run_terminal_command',
          input: { command: wrapped },
        }
        const matches = [...JSON.stringify(toolResult ?? '').matchAll(new RegExp(`${marker}(\\d+)`, 'g'))]
        const exit = matches.length ? matches[matches.length - 1][1] : null
        if (exit !== '0') failed.push(cmd)
      }

      if (failed.length === 0) return
      if (cycles >= max) {
        yield {
          toolName: 'set_output',
          input: {
            output: {
              status: 'failed',
              reason: `quality gate still failing after ${max} cycle(s)`,
              failedCommands: failed,
            },
          },
        }
        return
      }
      // The model sees all failing command output above. Keep the turn alive so
      // it can diagnose/fix, then the next completion attempt is re-verified.
    }
  },
  instructionsPrompt: `You are a QA gate. Definition of done: the FULL quality gate passes and coverage of the target behavior is adequate. Cycle until then.

Establish the gate (discover the real commands for each that exist in this project):
- tests, typecheck, lint/format check, build.

If the caller supplied \`gateCommands\`, those commands are an enforced contract: the harness re-runs every one whenever you try to finish and will keep the turn alive while any command fails. Do not substitute weaker commands.

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
- Stop and report if you stall; when gateCommands are supplied, the harness also has a hard maxCycles cap.

Finish: report each gate command and its final clean output, tests added, and the review outcome.`,
}

export default omfUltraqa
