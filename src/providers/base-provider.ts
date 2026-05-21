// 多模态内容（OpenAI 兼容 vision 格式）
export type MessageContent =
  | string
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

// LLM 消息类型（OpenAI 兼容格式）
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  // DeepSeek 特有的 thinking 字段 — 必须原样传回
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// 工具定义（OpenAI 格式）
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDef[];
  // DeepSeek 特有的 thinking 配置
  thinking?: {
    type: "enabled" | "disabled";
  };
  reasoningEffort?: "max" | "high" | "medium" | "min";
}

export interface StreamChunk {
  type: "text" | "thinking" | "tool_call" | "finish";
  content: string;
  toolCall?: Partial<ToolCall> & { index: number };
  // DeepSeek: accumulated reasoning content
  reasoningContent?: string;
}

// LLM Provider 统一接口
export interface LLMProvider {
  readonly name: string;

  // 流式聊天 — 返回 AsyncGenerator
  chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncGenerator<StreamChunk>;

  // 能力检测
  supportsThinking(): boolean;
  supportsCaching(): boolean;
}
