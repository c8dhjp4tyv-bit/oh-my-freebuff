/**
 * Minimal, dependency-free typings for Freebuff / Codebuff agent definitions.
 *
 * These mirror the public `AgentDefinition` shape exported by `@codebuff/sdk`
 * so that the agents in this pack type-check on their own, without forcing you
 * to install the SDK just to lint them. At runtime the Freebuff / Codebuff CLI
 * loads the agent files directly from your `.agents` directory and provides the
 * real implementations of every tool referenced here.
 *
 * If you already depend on `@codebuff/sdk`, feel free to import
 * `AgentDefinition` from there instead — the fields used in this pack are a
 * strict subset of the official type.
 */

export type ModelName =
  // Cheap / fast tier — great for file finding, search and simple edits.
  | 'deepseek/deepseek-chat-v3-0324'
  | 'z-ai/glm-4.7-flash'
  | 'z-ai/glm-4.6'
  | 'google/gemini-2.5-flash'
  | 'google/gemini-2.5-flash-lite'
  | 'qwen/qwen3-coder-flash'
  | 'x-ai/grok-4-fast'
  // Strong tier — reasoning, architecture, review, hard debugging.
  | 'z-ai/glm-4.7'
  | 'qwen/qwen3-coder-plus'
  | 'deepseek/deepseek-r1-0528'
  | 'moonshotai/kimi-k2.5'
  | 'anthropic/claude-sonnet-4.5'
  | 'openai/gpt-5.1'
  | 'google/gemini-2.5-pro'
  // Any other OpenRouter model id is also accepted.
  | (string & {})

export type ToolName =
  | 'add_message'
  | 'ask_user'
  | 'code_search'
  | 'end_turn'
  | 'find_files'
  | 'glob'
  | 'list_directory'
  | 'lookup_agent_info'
  | 'read_docs'
  | 'read_files'
  | 'run_file_change_hooks'
  | 'run_terminal_command'
  | 'set_messages'
  | 'set_output'
  | 'skill'
  | 'spawn_agents'
  | 'str_replace'
  | 'suggest_followups'
  | 'task_completed'
  | 'think_deeply'
  | 'web_search'
  | 'write_file'
  | 'write_todos'
  | (string & {})

export interface AgentInputSchema {
  prompt?: { type: 'string'; description?: string }
  params?: Record<string, unknown>
}

export interface AgentDefinition {
  /** Unique id: lowercase letters, numbers and hyphens only, e.g. 'code-reviewer'. */
  id: string
  /** Human-readable name shown in the CLI picker. */
  displayName: string
  /** OpenRouter model id used to run this agent. */
  model: ModelName
  /** Optional publisher id (needed only if you publish to the agent store). */
  publisher?: string
  /** Optional version string. Defaults to '0.0.1' and bumps on publish. */
  version?: string
  /** Reasoning-token controls for models that support them. */
  reasoningOptions?: {
    enabled?: boolean
    exclude?: boolean
    effort?: 'high' | 'medium' | 'low' | 'minimal' | 'none'
    max_tokens?: number
  }
  /** Tools this agent is allowed to call. */
  toolNames?: ToolName[]
  /** Other agents this agent may spawn (local id or store id like 'codebuff/file-picker@0.0.1'). */
  spawnableAgents?: string[]
  /** What input the agent accepts when spawned. */
  inputSchema?: AgentInputSchema
  /** How output is returned to the parent. */
  outputMode?: 'last_message' | 'all_messages' | 'structured_output'
  /** When and why another agent should spawn this one. Key for composability:
   * orchestrators read it to decide which specialist fits a sub-task. */
  spawnerPrompt?: string
  /** Whether the parent should include this agent's messages in its own context. */
  includeMessageHistory?: boolean
  /** Reuse the parent's system prompt prefix (enables prompt caching). */
  inheritParentSystemPrompt?: boolean
  /** Background info. Prefer instructionsPrompt for actual instructions. */
  systemPrompt?: string
  /** Primary place to shape behavior. Inserted after each user input. */
  instructionsPrompt?: string
  /** Inserted at each agent step. Rarely needed. */
  stepPrompt?: string
  /**
   * Optional generator to drive the agent programmatically. Yield tool calls,
   * 'STEP' (one model turn) or 'STEP_ALL' (run until end_turn), or return to
   * finish. Used by the orchestrators in this pack.
   */
  handleSteps?: (context: {
    agentState: unknown
    prompt?: string
    params?: Record<string, unknown>
    logger: { debug: Fn; info: Fn; warn: Fn; error: Fn }
  }) => Generator<
    | { toolName: string; input: Record<string, unknown>; includeToolCall?: boolean }
    | 'STEP'
    | 'STEP_ALL',
    void,
    { agentState: unknown; toolResult: unknown; stepsComplete: boolean }
  >
}

type Fn = (data: unknown, msg?: string, ...args: unknown[]) => unknown

export default AgentDefinition
