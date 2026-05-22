import type { LLMProvider, Message, ChatOptions, StreamChunk } from "./base-provider";
import { BaseStreamProvider } from "./base-stream-provider";

export class DeepSeekProvider extends BaseStreamProvider implements LLMProvider {
  readonly name = "deepseek";

  constructor(
    private baseUrl: string,
    private apiKey: string
  ) { super(); }

  supportsThinking(): boolean {
    return true;
  }

  supportsCaching(): boolean {
    return true;
  }

  protected buildBaseUrl(): string { return this.baseUrl; }
  protected getApiKey(): string { return this.apiKey; }

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const extraBody: Record<string, unknown> = {};

    if (options.thinking) {
      extraBody["thinking"] = options.thinking;
    }
    if (options.reasoningEffort) {
      extraBody["reasoning_effort"] = options.reasoningEffort;
    }

    yield* this.streamChat(messages, options, extraBody);
  }

  protected parseDelta(delta: Record<string, unknown>): { event?: StreamChunk; reasoningContent?: string } {
    const result = super.parseDelta(delta);

    if (delta.reasoning_content) {
      const rc = delta.reasoning_content as string;
      result.event = { type: "thinking", content: rc };
      result.reasoningContent = rc;
    }

    return result;
  }
}
