import type { LLMProvider, Message, ChatOptions, StreamChunk } from "./base-provider";

// 通用 OpenAI 兼容 Provider — 适用于任意兼容 API
export class OpenAICompatProvider implements LLMProvider {
  readonly name: string;

  constructor(
    name: string,
    private baseUrl: string,
    private apiKey: string
  ) {
    this.name = name;
  }

  supportsThinking(): boolean {
    return false;
  }

  supportsCaching(): boolean {
    return false;
  }

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 8192,
        ...(options.tools?.length ? { tools: options.tools } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder();
    let buffer = "";
    let reasoningContent = "";

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

          if (delta.content) {
            yield { type: "text", content: delta.content };
          }

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
