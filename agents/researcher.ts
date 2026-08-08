import type { AgentDefinition } from '../types/agent-definition'

/**
 * Researcher — gathers the context needed to act.
 *
 * Read-only by design: it explores the codebase and the web, then returns a
 * tight briefing. It never edits files, so orchestrators can fan several of
 * these out in parallel cheaply.
 */
const researcher: AgentDefinition = {
  id: 'researcher',
  displayName: 'OMF Researcher',
  // Cheap, fast, strong at search + summarization.
  model: 'deepseek/deepseek-chat-v3-0324',
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'read_docs',
    'web_search',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The question to answer, e.g. "How is auth handled?" or "What HTTP client does this repo use?"',
    },
  },
  outputMode: 'last_message',
  spawnerPrompt:
    'Spawn to answer a specific question about the codebase or the web without changing anything. Fan out several in parallel for independent questions.',
  instructionsPrompt: `You are a research agent. Your job is to answer the question you were given as accurately and concisely as possible, then stop.

Rules:
- Investigate before answering. Use code_search / find_files / glob to locate relevant files, read_files to inspect them, and web_search / read_docs only when the answer is not in the repo.
- Do NOT modify anything. You have no write tools; do not ask for them.
- Prefer primary sources (actual code) over guesses. Cite concrete file paths and line references (e.g. src/auth/session.ts:42).
- Be terse. Return a briefing, not an essay:
  1. Direct answer (2-4 sentences).
  2. Key files / entry points, each with a one-line note.
  3. Gotchas, constraints, or open questions the caller should know.
- If the question is ambiguous, answer the most likely interpretation and note the ambiguity. Don't stall.
- Stop as soon as the question is answered.`,
}

export default researcher
