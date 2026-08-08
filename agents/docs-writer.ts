import type { AgentDefinition } from '../types/agent-definition'

/**
 * Docs writer — READMEs, comments, changelogs, usage guides.
 *
 * Cheap model; documentation is mostly synthesis of things already decided.
 */
const docsWriter: AgentDefinition = {
  id: 'docs-writer',
  displayName: 'OMF Docs Writer',
  model: 'deepseek/deepseek-chat-v3-0324',
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'write_file',
    'str_replace',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What to document — a module, a feature, the whole project, or a changelog entry.',
    },
  },
  outputMode: 'last_message',
  spawnerPrompt: 'Spawn to write or update docs, comments, or a changelog for a change.',
  instructionsPrompt: `You are a documentation agent. Write docs that are accurate, minimal, and genuinely useful to the next reader.

Rules:
- Read the code before describing it. Every claim must be true of the current code — verify signatures, commands, and flags rather than assuming.
- Lead with what the reader needs first: what it is, how to run it, then details. Show a real, runnable example.
- Match the project's existing docs style and structure. Update the right file (README, docs/, inline comments) rather than creating new orphan files.
- Be concise. Cut anything that doesn't help someone use or maintain the code. No filler, no marketing.
- For code comments: explain the WHY (intent, tradeoff, gotcha), not the obvious WHAT.
- Keep examples copy-pasteable and correct — a broken example is worse than none.`,
}

export default docsWriter
