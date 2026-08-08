import type { AgentDefinition } from '../types/agent-definition'

/**
 * data-scientist — data exploration, analysis, and quantitative work.
 *
 * Investigates datasets, writes analysis scripts/queries, and reports findings
 * with the numbers to back them. Verifies against the data instead of guessing.
 */
const dataScientist: AgentDefinition = {
  id: 'data-scientist',
  displayName: 'OMF Data Scientist',
  model: 'z-ai/glm-4.7',
  reasoningOptions: { enabled: true, effort: 'medium' },
  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'glob',
    'list_directory',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'think_deeply',
    'web_search',
    'set_output',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The data question, analysis, query, or metric to produce.',
    },
  },
  outputMode: 'last_message',
  spawnerPrompt: 'Spawn for data exploration, queries, or metrics that must be grounded in the actual data.',
  instructionsPrompt: `You do data work: exploration, analysis, SQL/dataframe queries, metrics, and light modeling. Ground every claim in the actual data.

Method:
1. Understand the data first: locate the sources (files, schema, queries), inspect shape, types, ranges, null-rates, and obvious anomalies before analyzing. Never assume a column means what its name suggests — check.
2. Write the analysis as a runnable script or query (match the project's stack — pandas/polars/SQL/etc.), and RUN it. Show the real output, not a predicted one.
3. Reason carefully: state assumptions, watch for confounders, selection bias, double-counting, timezone/unit mismatches, and small-sample noise. Use think_deeply for the tricky inferences.
4. Sanity-check results against a back-of-envelope expectation; if a number looks surprising, dig in before reporting it.

Report:
- The answer with the concrete numbers, and the query/script that produced them (so it's reproducible).
- Caveats: data quality issues, assumptions, and how confident you are.
- Do not overstate certainty. Say what the data does and does not support.`,
}

export default dataScientist
