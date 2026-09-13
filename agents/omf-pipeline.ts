import type { AgentDefinition } from '../types/agent-definition'

/**
 * omf-pipeline — strict sequential staged processing.
 *
 * The coarse stage order is enforced by handleSteps rather than prompt text:
 * research → architecture → planning → implementation → testing → review/fix.
 * The model still decomposes the plan into atomic implementation tasks, but it
 * cannot skip ahead to testing/review before the preceding programmatic stages.
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
    'debugger',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task to run through a strict, ordered pipeline.',
    },
    params: {
      type: 'object',
      properties: {
        verifyCommand: {
          type: 'string',
          description: 'Optional final command that must exit 0 before the pipeline may report success.',
        },
        maxVerificationAttempts: {
          type: 'number',
          description: 'Maximum final verify/fix attempts when verifyCommand is supplied (default 4).',
        },
      },
    },
  },
  outputMode: 'last_message',
  handleSteps: function* ({ prompt, params }) {
    const compact = (value: unknown) => {
      let text
      try { text = JSON.stringify(value ?? '') } catch { text = String(value ?? '') }
      return text.length > 12000 ? `${text.slice(0, 12000)}…[truncated]` : text
    }
    const task = String(prompt || '')

    const { toolResult: research } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [{
          agent_type: 'researcher',
          prompt: `Pipeline stage 1/6 — RESEARCH. Map the code, constraints and relevant files for this task. Do not edit.\n\nTask: ${task}`,
        }],
      },
    }

    const { toolResult: design } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [{
          agent_type: 'architect',
          prompt: `Pipeline stage 2/6 — DESIGN. Choose the concrete technical approach for the task using the research below. Produce file-by-file decisions and call out risks.\n\nTask: ${task}\n\nResearch:\n${compact(research)}`,
        }],
      },
    }

    const { toolResult: plan } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [{
          agent_type: 'planner',
          prompt: `Pipeline stage 3/6 — PLAN. Produce an ordered implementation plan. Each implementation item must be atomic enough for one fresh implementer and must have a checkable done-condition.\n\nTask: ${task}\n\nResearch:\n${compact(research)}\n\nArchitecture:\n${compact(design)}`,
        }],
      },
    }

    // STEP_TEXT injects the completed upstream artifacts into the model context
    // and explicitly narrows the model's job to stage 4. The model can spawn one
    // fresh implementer per atomic plan item (the runtime owns those calls), but
    // the harness does not advance to test/review until this STEP_ALL finishes.
    yield {
      type: 'STEP_TEXT',
      text: `PIPELINE STAGE 4/6 — IMPLEMENT. The first three stages are complete and fixed in order. Execute the plan below now. Spawn a FRESH implementer for each atomic plan item, serially, and check each done-condition before moving on. Do not run the pipeline's tester/reviewer stages yourself; the harness will do that after implementation.\n\nTask: ${task}\n\nPlan:\n${compact(plan)}`,
    }
    yield 'STEP_ALL'

    const { toolResult: tests } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [{
          agent_type: 'tester',
          prompt: `Pipeline stage 5/6 — TEST. Inspect the implementation for the task, add or adjust appropriate tests, run the relevant verification, and report real command output.\n\nTask: ${task}\n\nPlan:\n${compact(plan)}`,
        }],
      },
    }

    const { toolResult: review } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [{
          agent_type: 'reviewer',
          prompt: `Pipeline stage 6/6 — REVIEW. Review the completed task using the plan and tester result below. Report must-fix findings first. You are read-only.\n\nTask: ${task}\n\nPlan:\n${compact(plan)}\n\nTest result:\n${compact(tests)}`,
        }],
      },
    }

    // A final model pass is intentionally after the read-only reviewer. It may
    // resolve must-fix findings with implementer/debugger, but cannot reorder the
    // already-completed research/design/plan/test/review stages.
    yield {
      type: 'STEP_TEXT',
      text: `PIPELINE REVIEW RESULT:\n${compact(review)}\n\nIf the reviewer reports any must-fix defect, resolve it now using implementer/debugger as needed, then re-run the directly affected checks. If there are no must-fix findings, make no unrelated edits. Finish this step only when the review is clean enough to proceed to the final verification gate.`,
    }
    yield 'STEP_ALL'

    const verifyCommand = typeof params?.verifyCommand === 'string' ? params.verifyCommand.trim() : ''
    if (!verifyCommand) return
    let max = Number(params?.maxVerificationAttempts)
    if (!Number.isInteger(max) || max < 1) max = 4

    for (let attempt = 1; attempt <= max; attempt++) {
      const marker = 'OMF_PIPELINE_VERIFY_EXIT='
      const wrapped = `${verifyCommand}; code=$?; printf "\\n${marker}%s\\n" "$code"`
      const { toolResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: wrapped },
      }
      const matches = [...JSON.stringify(toolResult ?? '').matchAll(/OMF_PIPELINE_VERIFY_EXIT=(\d+)/g)]
      const exit = matches.length ? matches[matches.length - 1][1] : null
      if (exit === '0') return

      if (attempt === max) {
        yield {
          toolName: 'set_output',
          input: {
            output: {
              status: 'failed',
              reason: `final verification still failing after ${max} attempt(s): ${verifyCommand}`,
            },
          },
        }
        return
      }

      yield {
        type: 'STEP_TEXT',
        text: `FINAL PIPELINE VERIFICATION FAILED (attempt ${attempt}/${max}). Fix the failure shown by the immediately preceding command without weakening the check. Then finish this step; the harness will re-run the exact same verification command.`,
      }
      yield 'STEP_ALL'
    }
  },
  instructionsPrompt: `You are a strict sequential pipeline lead. The harness enforces the coarse stage order in code: research → design → plan → implementation → test → review/fix. Do not try to skip or reorder stages.

During the IMPLEMENT step specifically:
- Read the injected planner output.
- Spawn one FRESH 'implementer' per atomic task, serially. Never hand the entire plan to one implementer.
- Check each task's done-condition before moving to the next.
- Use 'debugger' only when a failure's cause is non-obvious.
- Do not start the dedicated tester/reviewer stages yourself; the harness starts them after implementation.

During the post-review fix step:
- Resolve only genuine must-fix findings.
- Re-run checks affected by the fix.
- Do not refactor unrelated code.

If \`verifyCommand\` is supplied, the final success gate is deterministic: the harness re-runs that exact command and will not allow a green finish while it exits non-zero.

Finish by reporting the stage trail, files changed, real verification results, reviewer outcome, and any explicit failure/blocker.`,
}

export default omfPipeline
