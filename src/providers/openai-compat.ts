import type { LLMProvider, Message, ChatOptions, StreamChunk } from "./base-provider";
import { BaseStreamProvider } from "./base-stream-provider";

export class OpenAICompatProvider extends BaseStreamProvider implements LLMProvider {
  readonly name: string;

  constructor(
    name: string,
    private baseUrl: string,
    private apiKey: string
  ) {
    super();
    this.name = name;
  }

  supportsThinking(): boolean {
    return false;
  }

  supportsCaching(): boolean {
    return false;
  }

  protected buildBaseUrl(): string { return this.baseUrl; }
  protected getApiKey(): string { return this.apiKey; }

  async *chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    yield* this.streamChat(messages, options);
  }
}
