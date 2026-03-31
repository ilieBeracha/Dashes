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
 * Call an agent with the given context and return its response.
 */
export async function callAgent(
  agentType: AgentType,
  context: AgentContext
): Promise<AgentResponse> {
  const config = AGENT_CONFIG[agentType];

  // Build messages array
  const messages: Anthropic.MessageParam[] = [
    // Inject context as first user message
    {
      role: "user",
      content: buildContextMessage(context),
    },
    // Map recent conversation messages
    ...context.recentMessages.map((msg) => ({
      role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: msg.content,
    })),
  ];

  // Ensure messages alternate user/assistant
  const cleanedMessages = deduplicateRoles(messages);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: config.systemPrompt,
    tools: config.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    })),
    messages: cleanedMessages,
  });

  // Parse response
  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const toolCalls = response.content
    .filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    )
    .map((block) => ({
      toolName: block.name,
      input: block.input as Record<string, unknown>,
    }));

  // Check for handoff
  let handoff: AgentType | undefined;
  for (const tc of toolCalls) {
    if (tc.toolName === "hand_to_planner") handoff = "planner";
    if (tc.toolName === "hand_to_builder") handoff = "builder";
  }

  // Extract task list if planner created one
  const taskListCall = toolCalls.find((tc) => tc.toolName === "create_task_list");
  const tasks = taskListCall
    ? (taskListCall.input.tasks as AgentResponse["tasks"])
    : undefined;

  return {
    content: textContent,
    toolCalls,
    handoff,
    tasks,
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
