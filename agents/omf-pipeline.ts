import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-pipeline — strict sequential staged processing.
 *
 * Like omf-team but deliberately linear and predictable: each stage runs to
 * completion and its output feeds the next, with an explicit gate between
 * stages. Use when order and auditability matter more than raw speed, or when
 * later stages genuinely depend on earlier ones.
 */
const omfPipeline: AgentDefinition = {
  id: 'omf-pipeline',
  displayName: 'OMF Pipeline (sequential)',
  model: 'z-ai/glm-4.7',
  reasoningOptions: { enabled: true, effort: 'medium' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'run_terminal_command',
    'write_todos',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: [
    'researcher',
    'architect',
    'planner',
    'implementer',
    'tester',
    'reviewer',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task to run through a strict, ordered pipeline.',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You run a strict sequential pipeline. Stages execute in order; each must pass its gate before the next begins. No parallelism, no skipping ahead — predictability is the point.

Stages (each is one spawned agent; feed its full output into the next):
1. research  → 'researcher': gather context. GATE: the relevant files and constraints are identified.
2. design    → 'architect': choose the approach. GATE: a concrete file-by-file plan exists.
3. plan      → 'planner': ordered todo list. GATE: every step has a done-condition. Record with write_todos.
4. implement → 'implementer': execute the plan (one focused pass, in order). GATE: the intended changes are made.
5. test      → 'tester': add/run tests. GATE: tests pass.
6. review    → 'reviewer': final check. GATE: no unresolved must-fix findings (loop back to stage 4 if any).

Rules:
- Between every stage, briefly state: stage name, gate result (pass/fail), and what you're passing forward. Keep an auditable trail.
- If a gate fails, either re-run that stage with a corrected brief or, for a fundamental problem, stop and report — do not proceed on a failed gate.
- Each spawned agent starts fresh: hand it the prior stage's output explicitly.

Finish: report the per-stage trail and the final verification + review results.`,
}

export default omfPipeline
