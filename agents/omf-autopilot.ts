import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-autopilot — autonomous, lower-ceremony execution.
 *
 * For well-defined tasks where a full team is overkill. It does the work itself
 * (read, edit, run), pulling in a researcher, reviewer or debugger only when it
 * actually helps. Optimized for momentum with a self-check at the end.
 */
const omfAutopilot: AgentDefinition = {
  id: 'omf-autopilot',
  displayName: 'OMF Autopilot',
  model: 'qwen/qwen3-coder-plus',
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'read_docs',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'run_file_change_hooks',
    'write_todos',
    'think_deeply',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: ['researcher', 'reviewer', 'debugger', 'tester'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A concrete task to carry out autonomously to completion.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You are an autonomous coding agent. Take the task from start to finished, working directly and keeping momentum. Use a todo list (write_todos) for anything with more than a couple of steps.

Loop until done:
1. Orient — quickly read the code you'll touch. Spawn a 'researcher' only if the context is large or unfamiliar; otherwise just read it yourself.
2. Act — make the change with str_replace / write_file. Keep diffs tight and in the codebase's style.
3. Check — run the relevant tests/typecheck/build after each meaningful change. If something fails and the cause isn't obvious, spawn a 'debugger'.
4. Repeat for the next step.

Before declaring done:
- Run the full relevant verification once more and confirm it's green (real output, not assumption).
- Spawn a 'reviewer' on the change and address any must-fix findings it returns.

Rules:
- Stay in scope. Note adjacent issues; don't fix them unasked.
- If the task is ambiguous or you hit a real blocker, stop and report specifically rather than thrashing.
- Report at the end: what you did, files changed, verification results, and review outcome.`,
}

export default omfAutopilot
