import type { LLMProvider, Message, ChatOptions, StreamChunk } from "./base-provider";

const REQUEST_TIMEOUT_MS = 300_000;

export abstract class BaseStreamProvider implements LLMProvider {
  abstract readonly name: string;
  abstract supportsThinking(): boolean;
  abstract supportsCaching(): boolean;
  abstract chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk>;

  protected buildBaseUrl(): string {
    throw new Error("Not implemented");
  }
  protected getApiKey(): string {
    throw new Error("Not implemented");
  }

  protected async *streamChat(
    messages: Message[],
    options: ChatOptions,
    extraBody?: Record<string, unknown>,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 8192,
      ...(extraBody ?? {}),
      ...(options.tools?.length ? { tools: options.tools } : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.buildBaseUrl()}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.getApiKey()}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      throw new Error(`API request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let reasoningContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const parsed = this.parseSSELine(line, reasoningContent);
          if (!parsed) continue;
          if (parsed.reasoningContent !== undefined) reasoningContent = parsed.reasoningContent;
          if (parsed.event) yield parsed.event;
          if (parsed.done) {
            yield { type: "finish", content: "", reasoningContent };
            clearTimeout(timeout);
            signal?.removeEventListener("abort", onAbort);
            return;
          }
        }
      }

      if (buffer.trim()) {
        const parsed = this.parseSSELine(buffer, reasoningContent);
        if (parsed?.event) yield parsed.event;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }

    yield { type: "finish", content: "", reasoningContent };
  }

  private parseSSELine(
    line: string,
    _reasoningContent: string
  ): { event?: StreamChunk; reasoningContent?: string; done?: boolean } | null {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) return null;

    const data = trimmed.slice(6);
    if (data === "[DONE]") return { done: true };

    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return null;

      return this.parseDelta(delta);
    } catch {
      return null;
    }
  }

  protected parseDelta(delta: Record<string, unknown>): { event?: StreamChunk; reasoningContent?: string } {
    const result: { event?: StreamChunk; reasoningContent?: string } = {};

    if (delta.content) {
      result.event = { type: "text", content: delta.content as string };
    }

    if (delta.tool_calls) {
      const toolCalls = delta.tool_calls as Array<Record<string, unknown>>;
      if (toolCalls.length > 0) {
        const tc = toolCalls[0]!;
        const fn = tc.function as Record<string, unknown> | undefined;
        result.event = {
          type: "tool_call",
          content: (fn?.arguments as string) ?? "",
          toolCall: {
            id: tc.id as string | undefined,
            index: (tc.index as number) ?? 0,
            type: "function" as const,
            function: {
              name: (fn?.name as string) ?? "",
              arguments: (fn?.arguments as string) ?? "",
            },
          },
        };
      }
    }

    return result;
  }
}
