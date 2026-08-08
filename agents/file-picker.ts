import type { AgentDefinition } from '../types/agent-definition'

/**
 * file-picker — returns the files that matter for a task.
 *
 * Cheapest agent in the pack. Orchestrators spawn it to shortlist files before
 * spending a stronger model on reading them.
 */
const filePicker: AgentDefinition = {
  id: 'file-picker',
  displayName: 'OMF File Picker',
  model: 'deepseek/deepseek-chat-v3-0324',
  toolNames: [
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'read_files',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task or question; returns the files most relevant to it.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You locate the files that matter for a task. You are fast and cheap — do not over-read.

Method:
- Use glob / find_files / code_search to hunt by name and by content. Peek at files only when the path/name is ambiguous.
- Return a ranked shortlist (usually 3-15 files), each as: \`path — one-line reason it's relevant\`.
- Group into "core" (you'll almost certainly edit/read these) and "context" (supporting).
- Note obvious entry points (main, routes, config) when relevant.

Rules:
- Do NOT read entire files or summarize their contents in depth — that's the researcher's job. You point; others read.
- Do NOT modify anything.
- Be fast. A good-enough shortlist now beats an exhaustive one later.`,
}

export default filePicker
