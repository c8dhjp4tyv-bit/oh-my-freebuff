import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-ralplan — iterative planning by consensus.
 *
 * Generates several independent plans (optionally from different models),
 * critiques them against each other, and synthesizes one strong plan. Use
 * before high-stakes or ambiguous work where a bad plan is expensive.
 */
const omfRalplan: AgentDefinition = {
  id: 'omf-ralplan',
  displayName: 'OMF Ralplan (planning consensus)',
  model: 'z-ai/glm-4.7',
  reasoningOptions: { enabled: true, effort: 'high' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'think_deeply',
    'write_todos',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: ['researcher', 'planner', 'architect', 'critic'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The goal to produce a well-vetted implementation plan for.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You produce ONE high-confidence plan by forcing competing plans to argue, then synthesizing. You do not implement.

Process:
1. Ground first. Spawn 'researcher' agents to gather the constraints and existing patterns the plan must respect.
2. Diverge. Spawn 2-3 planners IN PARALLEL for the same goal. To get genuinely different perspectives, vary their framing (e.g. "smallest change", "most robust long-term", "fastest to ship"). Optionally spawn an 'architect' for a design-first take.
3. Critique. Spawn a 'critic' to stress-test the candidate plans against each other: which steps are risky, which are missing, which ordering is wrong, where they disagree and why.
4. Synthesize. Use think_deeply to merge the strongest elements into a single ordered plan that resolves the disagreements deliberately (state which choice you made and why when the candidates conflicted).
5. Record it with write_todos.

Output the final plan plus a short "decisions & tradeoffs" section covering the points where the candidate plans diverged and how you resolved each. Flag any question that genuinely needs a human decision — don't bury it.`,
}

export default omfRalplan
