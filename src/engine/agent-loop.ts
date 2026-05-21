import type { LLMProvider, Message, ChatOptions, ToolCall } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool, ToolResult, ToolDef } from "../tools/base-tool";
import { ContextCompressor } from "../context/compressor";
import { PermissionManager } from "../permissions/permission-manager";

export interface AgentEvent {
  type: "text" | "thinking" | "tool_start" | "tool_result" | "finish" | "error";
  content: string;
  toolName?: string;
  toolResult?: ToolResult;
}

export interface AgentOptions {
  memoryPrompt?: string;
  skillsPrompt?: string;
  permissionManager?: PermissionManager;
  onMessages?: (msgs: Message[]) => void;  // 每轮结束后回调，用于外部保存对话历史
}

export async function* agentLoop(
  provider: LLMProvider,
  settings: Settings,
  tools: Map<string, BaseTool>,
  userMessage: string,
  signal?: AbortSignal,
  options?: AgentOptions,
  images?: { url: string; detail?: string }[],
  history?: Message[]
): AsyncGenerator<AgentEvent> {
  const toolDefs: ToolDef[] = [];
  for (const tool of tools.values()) {
    toolDefs.push(tool.toToolDef());
  }

  // 多模态消息: 文本 + 图片
  let userContent: Message["content"] = userMessage;
  if (images && images.length > 0) {
    userContent = [
      { type: "text" as const, text: userMessage },
      ...images.map((img) => ({
        type: "image_url" as const,
        image_url: { url: img.url, detail: img.detail ?? "auto" },
      })),
    ];
  }

  // 使用已有历史或新建对话
  let messages: Message[];
  if (history && history.length > 0) {
    messages = [...history, { role: "user", content: userContent }];
  } else {
    const systemContent = buildSystemPrompt(tools, settings.model, options);
    messages = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];
  }

  let round = 0;
  const maxRounds = settings.tools.maxToolRounds;

  while (round < maxRounds) {
    if (signal?.aborted) {
      yield { type: "error", content: "Aborted by user" };
      return;
    }

    round++;

    // 上下文压缩检查（60% 时折叠，80% 时做更激进的清理）
    if (round % 5 === 0) {
      messages = ContextCompressor.dedupeToolCalls(messages);
    }
    if (round % 10 === 0 && messages.length > 30) {
      messages = ContextCompressor.collapseToolRounds(messages);
    }

    const chatOpts: ChatOptions = {
      model: settings.model,
      temperature: 0.6,
      maxTokens: 8192,
      tools: toolDefs,
    };

    if (provider.supportsThinking() && settings.thinking.enabled) {
      chatOpts.thinking = { type: "enabled" };
      chatOpts.reasoningEffort = settings.thinking.reasoningEffort;
    }

    // 收集完整响应
    let fullText = "";
    let reasoningContent = "";
    const toolCallAccum = new Map<number, {
      id: string;
      name: string;
      args: string;
    }>();

    try {
      for await (const chunk of provider.chat(messages, chatOpts)) {
        if (signal?.aborted) break;

        if (chunk.type === "thinking") {
          yield { type: "thinking", content: chunk.content };
        }

        if (chunk.type === "text") {
          fullText += chunk.content;
          yield { type: "text", content: chunk.content };
        }

        if (chunk.type === "tool_call" && chunk.toolCall) {
          const raw = chunk.toolCall;
          const idx = raw.index;

          let entry = toolCallAccum.get(idx);
          if (!entry) {
            entry = { id: "", name: "", args: "" };
            toolCallAccum.set(idx, entry);
          }

          if (raw.id) entry.id = raw.id;
          if (raw.function?.name) entry.name = raw.function.name;
          if (raw.function?.arguments) entry.args += raw.function.arguments;
        }

        if (chunk.type === "finish" && chunk.reasoningContent) {
          reasoningContent = chunk.reasoningContent;
        }
      }
    } catch (err) {
      yield {
        type: "error",
        content: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    // 组装完整 ToolCall 列表（用计数器保证 ID 唯一）
    let callSeq = 0;
    const toolCalls: ToolCall[] = [];
    for (const [_, entry] of toolCallAccum) {
      if (entry.name) {
        toolCalls.push({
          id: entry.id || `call_${Date.now()}_${callSeq++}`,
          type: "function" as const,
          function: {
            name: entry.name,
            arguments: entry.args,
          },
        });
      }
    }

    // 无工具调用 → 对话结束
    if (toolCalls.length === 0) {
      options?.onMessages?.(messages);
      yield { type: "finish", content: fullText };
      return;
    }

    // 添加 assistant 消息
    const assistantMessage: Message = {
      role: "assistant",
      content: fullText || null,
      tool_calls: toolCalls,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
    };
    messages.push(assistantMessage);

    // 按类型分组
    const readOnlyCalls: { tc: ToolCall; tool: BaseTool; args: Record<string, unknown> }[] = [];
    const writeCalls: { tc: ToolCall; tool: BaseTool; args: Record<string, unknown> }[] = [];

    for (const tc of toolCalls) {
      const tool = tools.get(tc.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Unknown tool: ${tc.function.name}`,
        });
        yield {
          type: "tool_result",
          content: `Unknown tool: ${tc.function.name}`,
          toolName: tc.function.name,
          toolResult: { success: false, output: `Unknown tool: ${tc.function.name}`, truncated: false },
        };
        continue;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      // 权限检查
      const permManager = options?.permissionManager;
      if (!tool.isReadOnly && permManager) {
        const filePath = args["file_path"] as string | undefined;
        const check = permManager.check(tool.name, tool.isReadOnly, filePath);

        if (check === "deny") {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Permission denied: ${tool.name} is blocked by current permission mode`,
          });
          yield {
            type: "tool_result",
            content: `Permission denied for ${tool.name}`,
            toolName: tool.name,
            toolResult: { success: false, output: `Permission denied`, truncated: false },
          };
          continue;
        }
      }

      if (tool.isReadOnly) {
        readOnlyCalls.push({ tc, tool, args });
      } else {
        writeCalls.push({ tc, tool, args });
      }
    }

    // 并行执行只读工具
    for (const { tool } of readOnlyCalls) {
      yield { type: "tool_start", content: `Running ${tool.name}...`, toolName: tool.name };
    }

    const readResults = await Promise.all(
      readOnlyCalls.map(async ({ tc, tool, args }) => {
        const result = await tool.execute(args);
        return { tc, result };
      })
    );

    for (const { tc, result } of readResults) {
      const truncated = ContextCompressor.truncateToolOutput(result.output);
      yield { type: "tool_result", content: result.output, toolName: tc.function.name, toolResult: result };
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: truncated,
      });
    }

    // 串行执行写入工具
    for (const { tc, tool, args } of writeCalls) {
      if (signal?.aborted) break;

      yield { type: "tool_start", content: `Running ${tool.name}...`, toolName: tool.name };
      const result = await tool.execute(args);
      yield { type: "tool_result", content: result.output, toolName: tool.name, toolResult: result };

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.output,
      });
    }
  }

  options?.onMessages?.(messages);
  yield { type: "error", content: `Max tool rounds (${maxRounds}) reached` };
}

// 构建完整的 system prompt
function buildSystemPrompt(tools: Map<string, BaseTool>, model: string, options?: AgentOptions): string {
  const toolList = [...tools.values()]
    .map((t) => `- **${t.name}**: ${t.description} ${t.requiresApproval ? "(requires approval)" : ""}`)
    .join("\n");

  const parts = [
    "You are DS Code, an AI coding agent running in the terminal.",
    "You are powered by the model " + model + ".",
    "You help users with software engineering tasks: writing code, debugging, refactoring, and explaining code.",
    "",
    "## Session Context",
    "Current date: " + new Date().toISOString().split("T")[0],
    "Working directory: " + process.cwd(),
    "",
    "## Instructions",
    "- Be concise and direct. Use chinese for explanations, keep code identifiers in English.",
    "- Use tools to read, edit, and search code. Prefer dedicated tools over Bash.",
    "- When editing, use Edit for small precise changes, Write for creating/overwriting files.",
    "- Read tools can run in parallel; write tools run sequentially.",
    "- Never guess file paths — use Glob or Grep to find files first.",
    "- Don't add features, refactor, or introduce abstractions beyond what the task requires.",
    "- Default to writing no comments. Only add one when the WHY is non-obvious.",
  ];

  // 注入记忆
  if (options?.memoryPrompt) {
    parts.push(options.memoryPrompt);
  }

  // 注入 Skills
  if (options?.skillsPrompt) {
    parts.push(options.skillsPrompt);
  }

  // 工具列表
  parts.push("## Available Tools", toolList);

  return parts.join("\n");
}

// 保留 Phase 1 的简单对话接口（向后兼容）
export async function* simpleChat(
  provider: LLMProvider,
  settings: Settings,
  userMessage: string
): AsyncGenerator<string> {
  const emptyTools = new Map<string, BaseTool>();
  for await (const event of agentLoop(provider, settings, emptyTools, userMessage)) {
    if (event.type === "text") {
      yield event.content;
    }
  }
}
