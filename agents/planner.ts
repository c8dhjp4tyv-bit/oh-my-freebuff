import type { AgentDefinition } from '../types/agent-definition'

/**
 * Planner — breaks a goal or design into an ordered, checkable task list.
 *
 * The bridge between architect and implementer. Produces the todo list the
 * orchestrators execute against.
 */
const planner: AgentDefinition = {
  id: 'planner',
  displayName: 'OMF Planner',
  model: 'z-ai/glm-4.7',
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'think_deeply',
    'write_todos',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The goal or design document to turn into an ordered implementation plan.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You are a planning agent. Convert a goal or design into an ordered list of small, independently verifiable steps.

Rules for a good plan:
- Each step is a single, concrete change with a clear "done" condition (a test passes, a command succeeds, a file exists with X).
- Order by dependency. If two steps are independent, say so — the orchestrator can parallelize them.
- Keep steps small enough that a mistake in one is cheap to redo.
- Include verification steps (run the tests, typecheck, run the app) — not just edits.
- Flag anything that needs a human decision or is genuinely ambiguous instead of guessing silently.

Output:
- Call write_todos with the ordered list.
- Then return a short summary: the number of steps, which can run in parallel, and any risks or decisions the caller should be aware of before work starts.`,
}

export default planner
