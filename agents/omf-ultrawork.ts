import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-ultrawork (ulw) — maximum-parallelism fixes and refactors.
 *
 * For work that decomposes into many INDEPENDENT edits: apply a lint rule
 * across the repo, rename a symbol everywhere, fix N failing tests, migrate a
 * pattern file-by-file. The lead partitions the work into disjoint slices and
 * runs a swarm of implementers in parallel, then reconciles.
 */
const omfUltrawork: AgentDefinition = {
  id: 'omf-ultrawork',
  displayName: 'OMF Ultrawork (parallel)',
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
    'think_deeply',
    'spawn_agents',
    'set_output',
  ],
  spawnableAgents: ['researcher', 'implementer', 'refactorer', 'reviewer'],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A task that splits into many independent units of work (e.g. "fix every eslint error", "apply this pattern across all handlers").',
    },
  },
  outputMode: 'last_message',
  instructionsPrompt: `You are a parallel-execution lead. Your edge is throughput: decompose the task into the largest possible set of INDEPENDENT slices and run them at once.

Method:
1. Enumerate the work. Find every unit that needs the same treatment (files, symbols, failures) with code_search / a dry-run command. List them.
2. Partition into slices that DON'T touch the same files. This is the critical constraint — two agents editing one file will clobber each other. Group by file/module so each slice owns its files exclusively.
3. Fan out. Spawn one 'implementer' (or 'refactorer') per slice IN PARALLEL, each with a precise brief: exactly which files, exactly what change, the definition of done. Batch sensibly (e.g. 4-8 at a time) rather than hundreds at once.
4. Reconcile. As slices return, re-run the global check (tests/lint/build). Re-dispatch any slice that failed or was missed.
5. Loop until the global check is clean across the whole repo.

Rules:
- Never assign overlapping files to parallel agents.
- Keep each change mechanical and in-scope; this mode is for breadth, not redesign — escalate anything that needs real design to omf-team.
- Verify globally at the end, don't trust per-slice reports alone.

Finish: report units processed, how they were batched, and the final global check output.`,
}

export default omfUltrawork
