import { describe, it, expect } from "bun:test";
import type { LLMProvider, Message, ChatOptions, StreamChunk } from "../src/providers/base-provider";

// Mock Provider — 模拟 LLM 响应
class MockProvider implements LLMProvider {
  readonly name = "mock";
  private responses: StreamChunk[][];
  private callCount = 0;

  constructor(responses: StreamChunk[][]) {
    this.responses = responses;
  }

  supportsThinking() { return false; }
  supportsCaching() { return false; }

  async *chat(_messages: Message[], _options: ChatOptions): AsyncGenerator<StreamChunk> {
    const chunks = this.responses[this.callCount] ?? [];
    this.callCount++;
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}

// 辅助函数：创建带工具调用的响应
function toolCallResponse(name: string, args: Record<string, unknown>, id = "call_1"): StreamChunk[] {
  return [
    {
      type: "tool_call",
      content: JSON.stringify(args),
      toolCall: { id, index: 0, type: "function", function: { name, arguments: JSON.stringify(args) } },
    },
    { type: "finish", content: "" },
  ];
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: "text", content: text },
    { type: "finish", content: "" },
  ];
}

describe("AgentLoop", () => {
  it("should return text response (no tools)", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");
    const provider = new MockProvider([textResponse("Hello!")]);
    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map();

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "hi")) {
      events.push(ev);
    }

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents.map((e: any) => e.content).join("")).toContain("Hello");
  });

  it("should execute tool calls and continue loop", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");
    const { ReadTool } = await import("../src/tools/file-read");
    const { writeFileSync, unlinkSync } = await import("node:fs");

    // 在测试目录创建临时文件
    const tmpFile = "/tmp/dscode-test-loop.txt";
    writeFileSync(tmpFile, "test content", "utf-8");

    const provider = new MockProvider([
      // 第1轮: 调用 Read 工具
      [
        {
          type: "tool_call",
          content: JSON.stringify({ file_path: tmpFile }),
          toolCall: { id: "call_1", index: 0, type: "function", function: { name: "Read", arguments: JSON.stringify({ file_path: tmpFile }) } },
        },
        { type: "finish", content: "" },
      ],
      // 第2轮: 文本回复
      textResponse("File read successfully."),
    ]);

    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map([["Read", new ReadTool()]]);

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "read the file")) {
      events.push(ev);
    }

    // 应该有工具执行事件
    expect(events.some((e) => e.type === "tool_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    expect(events.some((e) => e.type === "text")).toBe(true);

    unlinkSync(tmpFile);
  });

  it("should parallelize readonly tools", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");
    const { ReadTool } = await import("../src/tools/file-read");
    const { writeFileSync, unlinkSync } = await import("node:fs");

    const tmpFile1 = "/tmp/dscode-test-1.txt";
    const tmpFile2 = "/tmp/dscode-test-2.txt";
    writeFileSync(tmpFile1, "content1", "utf-8");
    writeFileSync(tmpFile2, "content2", "utf-8");

    const provider = new MockProvider([
      [
        {
          type: "tool_call",
          content: "{}",
          toolCall: { id: "c1", index: 0, type: "function", function: { name: "Read", arguments: JSON.stringify({ file_path: tmpFile1 }) } },
        },
        {
          type: "tool_call",
          content: "{}",
          toolCall: { id: "c2", index: 1, type: "function", function: { name: "Read", arguments: JSON.stringify({ file_path: tmpFile2 }) } },
        },
        { type: "finish", content: "" },
      ],
      textResponse("Both files read."),
    ]);

    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map([["Read", new ReadTool()]]);

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "read two files")) {
      events.push(ev);
    }

    // 两个工具都应该有结果
    const toolResults = events.filter((e) => e.type === "tool_result");
    expect(toolResults.length).toBe(2);

    unlinkSync(tmpFile1);
    unlinkSync(tmpFile2);
  });

  it("should handle unknown tools", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");

    const provider = new MockProvider([
      toolCallResponse("NonExistentTool", { foo: "bar" }),
      textResponse("OK"),
    ]);

    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map();

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "test")) {
      events.push(ev);
    }

    const errors = events.filter((e) => e.content?.includes("Unknown tool"));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should respect maxRounds limit", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");

    // 每次都返回工具调用 → 会触发 maxRounds
    const provider = new MockProvider(
      Array(5).fill(toolCallResponse("Glob", { pattern: "*.ts" }))
    );

    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 3 } } as any;
    const tools = new Map();

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "test")) {
      events.push(ev);
    }

    const maxRoundEvent = events.find((e) => e.content?.includes("Max tool rounds"));
    expect(maxRoundEvent).toBeDefined();
  });

  it("should support abort signal", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");

    const provider = new MockProvider([
      // 返回多个 tool calls 但立即 abort
      toolCallResponse("Read", { file_path: "/test.txt" }),
    ]);

    const controller = new AbortController();
    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map();

    controller.abort(); // 在开始前就 abort

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "test", controller.signal)) {
      events.push(ev);
    }

    expect(events.some((e) => e.content?.includes("Aborted"))).toBe(true);
  });

  it("should inject memory into system prompt when options provided", async () => {
    const { agentLoop } = await import("../src/engine/agent-loop");

    const provider = new MockProvider([textResponse("I remember!")]);
    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;
    const tools = new Map();

    const events: any[] = [];
    for await (const ev of agentLoop(provider, settings, tools, "what do you remember?", undefined, {
      memoryPrompt: "## Memory\nUser prefers TypeScript.",
    })) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "text")).toBe(true);
  });
});

describe("simpleChat", () => {
  it("should yield text events", async () => {
    const { simpleChat } = await import("../src/engine/agent-loop");

    const provider = new MockProvider([textResponse("Simple reply")]);
    const settings = { model: "test", thinking: { enabled: false }, tools: { maxToolRounds: 5 } } as any;

    const texts: string[] = [];
    for await (const text of simpleChat(provider, settings, "hello")) {
      texts.push(text);
    }

    expect(texts.join("")).toContain("Simple reply");
  });
});
