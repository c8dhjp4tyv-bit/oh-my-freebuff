import type { AgentDefinition } from '../types/agent-definition'

/**
 * advisor-b — one voice in the omf-advisor panel (model B).
 * See advisor-a for the panel design.
 */
const advisorB: AgentDefinition = {
  id: 'advisor-b',
  displayName: 'OMF Advisor B',
  model: 'deepseek/deepseek-r1-0528',
  reasoningOptions: { enabled: true, effort: 'high' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'read_docs',
    'web_search',
    'think_deeply',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The question to answer, with any context the panel lead provides.',
    },
  },
  outputMode: 'last_message',
  spawnerPrompt: 'One voice of the advisor panel; spawn all three via omf-advisor for a cross-model opinion.',
  instructionsPrompt: `You are one advisor on a panel. Give YOUR best independent answer — don't hedge toward an imagined consensus; the panel's value is that voices differ.

Answer in this shape:
1. Recommendation — one clear sentence. Take a position.
2. Why — the 2-4 reasons that actually drive it, strongest first.
3. Key risk / what would change my mind — the main downside or the switch condition.
4. What might be overlooked — one thing others might miss.

Rules:
- If the lead gave you researched context, reason from it; otherwise verify the few facts your answer hinges on before committing.
- Be concise and decisive. This is advice, not an essay. You do not edit files.`,
}

export default advisorB
