import type { LLMProvider, Message, ChatOptions, StreamChunk } from "./base-provider";

// DeepSeek API 使用 OpenAI 兼容格式，额外支持 thinking 和 reasoning_effort
export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";

  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  supportsThinking(): boolean {
    return true;
  }

  supportsCaching(): boolean {
    return true;
  }

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 8192,
    };

    // DeepSeek thinking 配置
    if (options.thinking) {
      body["thinking"] = options.thinking;
    }
    if (options.reasoningEffort) {
      body["reasoning_effort"] = options.reasoningEffort;
    }
    if (options.tools && options.tools.length > 0) {
      body["tools"] = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
    }

    // 流式解析 SSE
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";
    let reasoningContent = ""; // 累积 reasoning_content，必须传回 API

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { type: "finish", content: "", reasoningContent };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // DeepSeek thinking 内容 (reasoning_content)
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
            yield {
              type: "thinking",
              content: delta.reasoning_content,
            };
          }

          // 普通文本内容
          if (delta.content) {
            yield { type: "text", content: delta.content };
          }

          // 工具调用
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield {
                type: "tool_call",
                content: tc.function?.arguments ?? "",
                toolCall: {
                  id: tc.id,
                  index: tc.index ?? 0,
                  type: "function",
                  function: {
                    name: tc.function?.name ?? "",
                    arguments: tc.function?.arguments ?? "",
                  },
                },
              };
            }
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  }
}
