/**
 * Conversational capstone — orchestrator.
 *
 * Accepts a user message + history, calls Claude with the tool layer,
 * loops until no more tool calls, and returns the final answer with
 * file references and a tool trace.
 *
 * THREE HARD LOCKS encoded in system prompt:
 *   1. READ/PRODUCE ONLY — no mutation tools; refuse if asked to mutate.
 *   2. GROUNDED — only state facts tool calls returned; surface all flags.
 *   3. PROJECT-SCOPED — every session within one project_id.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ALL_TOOLS, TOOL_MAP, type ToolContext } from './tools';

const MAX_TOOL_ROUNDS = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FileRef {
  label: string;
  ref: string;
  filename?: string;
  note?: string | null;
}

export interface ToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
}

export interface ConversationResult {
  answer: string;
  file_refs: FileRef[];
  tool_trace: ToolTraceEntry[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(projectId: string): string {
  return `You are the LightSelect Project Assistant — a read-only AI helper operating within project ${projectId}.

## HARD LOCK 1: READ/PRODUCE ONLY
You have access to seven tools. Every tool is read-only or produces a file export reference. You MUST NOT attempt to select a product, override a match decision, upload a document, delete anything, or edit any project state. No such tools exist. If a user asks you to perform any mutation — selecting a product, uploading a file, overriding a result, deleting data — you must refuse and explain that these actions must be performed in the project interface. Do not suggest workarounds.

## HARD LOCK 2: GROUNDED — TOOL RESULTS ONLY
You may only state facts that a tool call returned in this conversation. You must NOT:
- Invent compliance verdicts, product recommendations, or fit percentages from your own training.
- Interpret or guess at data quality. If a tool returns is_placeholder: true, data_quality: "estimated_placeholder", needs_review: true, is_override: true, or an "unmatched" / stub status, you MUST surface these flags explicitly to the user — never smooth them over.
- Claim a product complies or does not comply unless a tool returned that verdict.
If you cannot answer a question without calling a tool, say so and call the appropriate tool. If no tool can answer the question, say "I don't have access to that information."

## HARD LOCK 3: PROJECT-SCOPED
You are operating within project ${projectId} only. Do not reference, guess at, or compare data from other projects. All tool calls automatically scope to this project.

## Behaviour guidelines
- Be concise. Summarise tool results; don't repeat every field verbatim unless the user asks.
- When a tool returns flags (is_placeholder, needs_review, is_override, mode="no_candidates"), state them clearly.
- When returning a download reference, say so explicitly: "You can download this file at [label]" and include the ref so the UI can display it as a link.
- If you call multiple tools, synthesise the results into a clear answer.
- Never fabricate data. If a tool returns an empty result, say so.`;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runConversation(opts: {
  projectId: string;
  orgId: string;
  message: string;
  history: ConversationMessage[];
}): Promise<ConversationResult> {
  const { projectId, orgId, message, history } = opts;

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const model = process.env.CONVERSATION_MODEL ?? 'claude-sonnet-4-6';

  const toolSchemas = ALL_TOOLS.map((t) => t.schema);
  const ctx: ToolContext = { projectId, orgId };

  const fileRefs: FileRef[] = [];
  const toolTrace: ToolTraceEntry[] = [];

  // Build initial messages from history + new message
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
    { role: 'user', content: message },
  ];

  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(projectId),
      tools: toolSchemas,
      messages,
    });

    // Append assistant response to message history
    messages.push({ role: 'assistant', content: response.content });

    // No tool calls — we have the final answer
    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b) => b.type === 'text');
      const answer = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      return { answer, file_refs: fileRefs, tool_trace: toolTrace };
    }

    // Execute all tool calls in this round
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const executor = TOOL_MAP.get(block.name);
      if (!executor) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          is_error: true,
        });
        continue;
      }

      let result: unknown;
      try {
        result = await executor.execute(block.input as Record<string, unknown>, ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Tool execution failed.' };
      }

      // Collect file references from tools that return them
      if (result && typeof result === 'object' && !('error' in (result as object))) {
        const r = result as Record<string, unknown>;

        if (r.download_ref && typeof r.download_ref === 'string') {
          fileRefs.push({
            label: r.filename
              ? String(r.filename)
              : r.original_filename
              ? String(r.original_filename)
              : block.name,
            ref: r.download_ref,
            filename: r.filename as string | undefined,
            note: r.note as string | null | undefined,
          });
        }

        if (r.generate_ref && typeof r.generate_ref === 'string') {
          fileRefs.push({
            label: 'Generate Submittal Package',
            ref: r.generate_ref,
            note: r.note as string | null | undefined,
          });
        }

        if (r.documents && Array.isArray(r.documents)) {
          for (const doc of r.documents as Array<Record<string, unknown>>) {
            if (doc.download_ref) {
              fileRefs.push({
                label: String(doc.original_filename ?? doc.id ?? 'document'),
                ref: String(doc.download_ref),
                filename: doc.original_filename as string | undefined,
              });
            }
          }
        }
      }

      const resultStr = JSON.stringify(result);
      toolTrace.push({
        tool: block.name,
        args: block.input as Record<string, unknown>,
        result_summary: resultStr.length > 300
          ? resultStr.slice(0, 300) + '…'
          : resultStr,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultStr,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    answer: 'I reached the maximum number of tool-call rounds. Please try a more specific question.',
    file_refs: fileRefs,
    tool_trace: toolTrace,
  };
}
