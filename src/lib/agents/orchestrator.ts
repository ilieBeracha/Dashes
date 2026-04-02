import Anthropic from "@anthropic-ai/sdk";
import type { AgentType } from "@/types";
import type { AgentContext, AgentResponse } from "./types";
import {
  PLANNER_SYSTEM_PROMPT,
  BUILDER_SYSTEM_PROMPT,
  DEPLOY_SYSTEM_PROMPT,
} from "./prompts";
import { PLANNER_TOOLS, BUILDER_TOOLS, DEPLOY_TOOLS } from "./tools";

const client = new Anthropic();

const AGENT_CONFIG = {
  planner: { systemPrompt: PLANNER_SYSTEM_PROMPT, tools: PLANNER_TOOLS },
  builder: { systemPrompt: BUILDER_SYSTEM_PROMPT, tools: BUILDER_TOOLS },
  deploy: { systemPrompt: DEPLOY_SYSTEM_PROMPT, tools: DEPLOY_TOOLS },
} as const;

const MAX_TOOL_TURNS = 15;

/**
 * Route a message to the appropriate agent based on project state.
 */
export function routeMessage(
  hasActivePlan: boolean,
  hasPendingTasks: boolean,
  allTasksDone: boolean,
  content: string,
  hasToolbarContext: boolean
): AgentType {
  // Toolbar events with a change request → Builder directly
  if (hasToolbarContext && !content.toLowerCase().includes("deploy")) {
    return "builder";
  }

  // Explicit deploy intent
  if (/\b(deploy|ship|publish|launch)\b/i.test(content)) {
    return "deploy";
  }

  // No plan or new feature request
  if (!hasActivePlan) {
    return "planner";
  }

  // Plan exists with pending tasks
  if (hasPendingTasks) {
    return "builder";
  }

  // All tasks done — small tweak vs new feature
  if (allTasksDone) {
    const isSmallChange =
      content.length < 200 &&
      /\b(change|make|update|fix|tweak|adjust|move|resize|color|font|text|bigger|smaller)\b/i.test(
        content
      );
    return isSmallChange ? "builder" : "planner";
  }

  return "planner";
}

/**
 * Callback for tool execution — the caller provides this so the route can
 * execute tools and stream progress at the same time.
 */
export type ToolExecutor = (
  toolName: string,
  toolId: string,
  input: Record<string, unknown>
) => Promise<{ success: boolean; output: string }>;

/**
 * Call an agent with a full tool-use loop.
 * Keeps calling Claude until it responds with end_turn (no more tool calls).
 */
export async function callAgent(
  agentType: AgentType,
  context: AgentContext,
  onToolCall?: ToolExecutor,
  signal?: AbortSignal
): Promise<AgentResponse> {
  const config = AGENT_CONFIG[agentType];

  // Build initial messages array
  const conversationMessages: Anthropic.MessageParam[] = deduplicateRoles([
    {
      role: "user",
      content: buildContextMessage(context),
    },
    ...context.recentMessages.map((msg) => ({
      role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    })),
  ]);

  const tools = config.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool["input_schema"],
  }));

  const allTextParts: string[] = [];
  const allToolCalls: { toolName: string; input: Record<string, unknown> }[] = [];
  let handoff: AgentType | undefined;
  let extractedTasks: AgentResponse["tasks"];
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    if (signal?.aborted) {
      allTextParts.push("Task was cancelled.");
      break;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: config.systemPrompt,
      tools,
      messages: conversationMessages,
    }, { signal });

    // Collect text blocks
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    for (const block of textBlocks) {
      allTextParts.push(block.text);
    }

    // Collect tool_use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    for (const block of toolUseBlocks) {
      const tc = {
        toolName: block.name,
        input: block.input as Record<string, unknown>,
      };
      allToolCalls.push(tc);

      if (block.name === "hand_to_planner") handoff = "planner";
      if (block.name === "hand_to_builder") handoff = "builder";

      if (block.name === "create_task_list") {
        extractedTasks = tc.input.tasks as AgentResponse["tasks"];
      }
    }

    // If the model stopped without requesting tools, we're done
    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      break;
    }

    // Execute tools and build tool_result messages for the next turn
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let turnHadErrors = false;
    for (const block of toolUseBlocks) {
      if (onToolCall) {
        const result = await onToolCall(
          block.name,
          block.id,
          block.input as Record<string, unknown>
        );
        if (!result.success) turnHadErrors = true;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.output,
          is_error: !result.success,
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Tool executed successfully.",
        });
      }
    }

    // Track consecutive error turns to avoid infinite retry loops
    consecutiveErrors = turnHadErrors ? consecutiveErrors + 1 : 0;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      allTextParts.push(
        "Stopping: too many consecutive tool errors. Please check the task and try again."
      );
      break;
    }

    // Append assistant turn (with tool_use) + user turn (with tool_results)
    conversationMessages.push({
      role: "assistant",
      content: response.content,
    });
    conversationMessages.push({
      role: "user",
      content: toolResults,
    });
  }

  return {
    content: allTextParts.join("\n"),
    toolCalls: allToolCalls,
    handoff,
    tasks: extractedTasks,
  };
}

function buildContextMessage(context: AgentContext): string {
  const parts: string[] = [];

  if (context.taskList.length > 0) {
    parts.push("## Current Tasks");
    context.taskList.forEach((t, i) => {
      parts.push(`${i + 1}. [${t.status}] ${t.title}: ${t.description}`);
    });
  }

  if (context.fileManifest.length > 0) {
    parts.push("\n## Project Files");
    parts.push(context.fileManifest.join("\n"));
  }

  if (context.relevantFiles.length > 0) {
    parts.push("\n## Relevant File Contents");
    context.relevantFiles.forEach((f) => {
      parts.push(`### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
    });
  }

  if (context.toolbarContext) {
    parts.push("\n## Toolbar Context");
    parts.push(JSON.stringify(context.toolbarContext, null, 2));
  }

  return parts.join("\n") || "No project context yet. This is a new project.";
}

/**
 * Ensure messages alternate between user and assistant roles.
 */
function deduplicateRoles(
  messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];
    if (last && last.role === msg.role) {
      // Merge consecutive same-role messages
      last.content = `${last.content}\n\n${msg.content}`;
    } else {
      result.push({ ...msg });
    }
  }
  // Ensure first message is from user
  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "Please proceed with the task." });
  }
  return result;
}
