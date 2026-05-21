import type { Message } from "../providers/base-provider";

// 四层上下文压缩策略
export class ContextCompressor {
  // 第1层: 工具输出截断
  static truncateToolOutput(output: string, maxLen = 5000): string {
    if (output.length <= maxLen) return output;
    const truncated = output.slice(0, maxLen);
    const omitted = output.length - maxLen;
    return `${truncated}\n...[truncated: ${omitted} more chars]`;
  }

  // 第2层: 冗余检测 — 合并连续重复的工具调用
  static dedupeToolCalls(messages: Message[]): Message[] {
    if (messages.length < 3) return messages;

    const result: Message[] = [];
    let i = 0;

    while (i < messages.length) {
      const current = messages[i]!;
      if (current.role === "tool" && i + 1 < messages.length) {
        const next = messages[i + 1]!;
        if (next.role === "tool" && current.name === next.name) {
          result.push({
            role: "tool",
            content: `${current.content}\n${next.content}`,
            name: current.name,
            tool_call_id: current.tool_call_id || next.tool_call_id || "compressed",
          });
          i += 2;
          continue;
        }
      }
      result.push(current);
      i++;
    }

    return result;
  }

  // 第3层: 上下文折叠 — 将 tool_call + tool_result 合并为摘要
  static collapseToolRounds(messages: Message[]): Message[] {
    if (messages.length < 50) return messages;

    const result: Message[] = [];
    let skipUntil = -1;

    for (let i = 0; i < messages.length; i++) {
      if (i < skipUntil) continue;

      const msg = messages[i]!;

      // 检测 assistant(tool_calls) → tool_result 模式
      if (
        msg.role === "assistant" &&
        msg.tool_calls?.length &&
        i + msg.tool_calls.length < messages.length
      ) {
        const toolResults = messages.slice(i + 1, i + 1 + msg.tool_calls.length);
        const allTool = toolResults.every((m) => m.role === "tool");

        if (allTool) {
          // 合并为摘要
          const summary = toolResults
            .map((m) => `[${m.name ?? "tool"}]: ${(m.content ?? "").slice(0, 200)}`)
            .join(" | ");

          result.push({
            role: "assistant",
            content: `[tool calls: ${summary}]`,
          });

          skipUntil = i + 1 + msg.tool_calls.length;
          continue;
        }
      }

      result.push(msg);
    }

    return result;
  }

}
