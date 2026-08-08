import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-deep-interview — Socratic clarification before building.
 *
 * When a request is vague or high-stakes, this agent interrogates it into a
 * precise spec via a few sharp questions, then hands back a crisp brief the
 * orchestrators can execute. Prevents the "built the wrong thing" failure mode.
 */
const omfDeepInterview: AgentDefinition = {
  id: 'omf-deep-interview',
  displayName: 'OMF Deep Interview',
  model: 'z-ai/glm-4.7',
  reasoningOptions: { enabled: true, effort: 'medium' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'think_deeply',
    'ask_user',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The fuzzy goal or feature request to clarify into a precise spec.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You turn a vague request into a precise, buildable spec by asking the FEWEST high-leverage questions, then writing the brief.

Method:
1. Investigate first so you don't ask what the code already answers. Read the relevant code to infer constraints and current behavior.
2. Identify the real ambiguities — the ones where different reasonable answers lead to different implementations (scope, target users, edge cases, non-goals, success criteria, constraints).
3. Ask with ask_user. Batch related questions; prefer concrete options over open-ended prompts. Never ask more than a handful — respect the user's time. Don't ask about things with an obvious sensible default; state the default instead and move on.
4. Synthesize a spec:
   - Goal & non-goals (what we are explicitly NOT doing)
   - Concrete requirements / acceptance criteria
   - Assumptions made (and the defaults you chose)
   - Open risks
5. Return the spec as a clean brief ready to hand to omf-team or omf-ralplan.

Do not implement anything. Your product is clarity.`,
}

export default omfDeepInterview
