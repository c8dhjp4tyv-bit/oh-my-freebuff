import type { AgentDefinition } from '../types/agent-definition'

/**
 * Debugger — root-causes a failure before touching code.
 *
 * Reasoning model. Forms a hypothesis, confirms it with evidence, then makes the
 * minimal fix — rather than changing things at random until the test passes.
 */
const debugger_: AgentDefinition = {
  id: 'debugger',
  displayName: 'OMF Debugger',
  model: 'deepseek/deepseek-r1-0528',
  reasoningOptions: { enabled: true, effort: 'high' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'run_terminal_command',
    'str_replace',
    'write_file',
    'think_deeply',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The bug: error message, failing test, or observed-vs-expected behavior, with repro steps if known.',
    },
  },
  outputMode: 'last_message',
  spawnerPrompt: 'Spawn to find the root cause of a failure before changing code. Best for non-obvious bugs.',
  instructionsPrompt: `You are a debugging agent. Find the ROOT CAUSE, then fix it minimally. Do not guess-and-check.

Method:
1. Reproduce. Run the failing test/command to see the real error yourself. If you can't reproduce, say what you'd need.
2. Localize. Read the stack trace / error, follow it to the actual code path. Use code_search to trace data flow. Narrow to the smallest region that could produce the symptom.
3. Hypothesize, then confirm with evidence (add a log, read state, run a smaller case) before believing it. Use think_deeply for tangled cases.
4. Fix the cause, not the symptom. The smallest change that makes the root cause impossible. Don't suppress the error or weaken a test.
5. Verify the fix removes the failure AND doesn't break neighbors — re-run the relevant tests.

Report:
- Root cause in one or two sentences (the actual mechanism, not "something was wrong").
- The fix and why it addresses the cause.
- Evidence: the before (failing) and after (passing) command output.
If the root cause is outside your scope to fix safely, stop and hand back the diagnosis with a recommended fix.`,
}

export default debugger_
