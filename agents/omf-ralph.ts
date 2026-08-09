import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-ralph — persistent verify-fix loop.
 *
 * Pick one machine-checkable success condition (a command that must exit 0:
 * tests, typecheck, build) and work until it passes. Won't report success on a
 * red check. For "make CI pass", "get the suite green", "fix all type errors".
 */
const omfRalph: AgentDefinition = {
  id: 'omf-ralph',
  displayName: 'OMF Ralph (verify loop)',
  model: 'deepseek/deepseek-r1-0528',
  reasoningOptions: { enabled: true, effort: 'high' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'run_file_change_hooks',
    'write_todos',
    'think_deeply',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: ['researcher', 'debugger', 'implementer', 'tester'],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The goal AND its verification command, e.g. "make `npm test` pass" or "get `tsc --noEmit` to exit clean".',
    },
    params: {
      type: 'object',
      properties: {
        verifyCommand: {
          type: 'string',
          description:
            'Optional. The exact shell command that must exit 0 (e.g. "npm test"). When set, the loop runs it after every apparent completion and refuses to stop while it fails.',
        },
        maxIterations: {
          type: 'number',
          description: 'Optional cap on verify-fix cycles when verifyCommand is set (default 8).',
        },
      },
    },
  },
  outputMode: 'last_message',
  // Deterministic loop: when a verifyCommand is provided, the harness — not the
  // model — enforces "don't stop on a red check". EVERY time the agent tries to
  // finish we re-run the command and read its REAL exit status via an appended
  // sentinel (not by pattern-matching output, which is why "0 failures" no longer
  // trips a false negative). Two distinct exits, never shared:
  //   • the command exits 0 → success, end the turn.
  //   • the command still fails after maxIterations → record an explicit failure
  //     via set_output and end the turn — so an exhausted loop is never mistaken
  //     for green just because the model's last message claimed success.
  // With no verifyCommand it behaves as a normal prompt-driven agent.
  handleSteps: function* ({ params }) {
    const cmd = typeof params?.verifyCommand === 'string' ? params.verifyCommand.trim() : ''
    let max = Number(params?.maxIterations)
    if (!Number.isInteger(max) || max < 1) max = 8
    const wrapped = cmd ? `${cmd}; echo "OMF_VERIFY_EXIT=$?"` : ''
    let verifications = 0
    while (true) {
      const { stepsComplete } = yield 'STEP'
      if (!stepsComplete) continue
      if (!wrapped) return // nothing to enforce — respect the model's end_turn
      // A completion attempt ALWAYS gets verified before we let the turn end.
      verifications++
      const { toolResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: wrapped },
      }
      const m = JSON.stringify(toolResult ?? '').match(/OMF_VERIFY_EXIT=(\d+)/)
      if (m && m[1] === '0') return // genuine exit 0 → success
      if (verifications >= max) {
        // Out of attempts and still red → fail loudly, don't fall through to green.
        yield {
          toolName: 'set_output',
          input: {
            output: {
              status: 'failed',
              reason: `verification command still failing after ${max} attempt(s): ${cmd}`,
            },
          },
        }
        return
      }
      // Still red, attempts remain → keep going; the model sees the failing output.
    }
  },
  instructionsPrompt: `You are a persistent verification loop. You are done ONLY when a specific check command exits successfully — never before.

Setup:
- Identify the exact verification command from the task (the tests, the typecheck, the build, the linter). If it's not given, discover the right one and state it explicitly. This command is your single source of truth.
- If the caller passed a \`verifyCommand\` param, the harness will re-run it automatically whenever you try to finish and will not let you stop while it still fails — so make that command the real gate and keep working until it is genuinely green.

Loop — repeat until the check passes:
1. Run the verification command with run_terminal_command. Read the ACTUAL output.
2. If it exits 0 with no failures: you're done. Go to "Finish".
3. If it fails: pick ONE failure (usually the first / most fundamental). Diagnose its root cause — spawn a 'debugger' for anything non-obvious. Track remaining failures with write_todos.
4. Apply the minimal fix (yourself, or via an 'implementer' for a larger sub-task). Do not weaken or delete the check to make it pass — that is failing, not passing.
5. Go back to step 1. Always re-run the FULL check after a fix; fixing one thing can break another.

Guardrails:
- Never claim success without a final clean run whose real output you show.
- If you make no progress across several iterations (same failure, fixes not helping), stop and report the blocker with your best diagnosis — don't loop forever.
- Stay focused on the check. Don't refactor unrelated code.

Finish: report the final command, its clean output, and a short summary of what was wrong and how you fixed it.`,
}

export default omfRalph
