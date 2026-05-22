import { describe, it, expect, beforeEach } from "bun:test";
import { DeepSeekProvider } from "../src/providers/deepseek";
import { OpenAICompatProvider } from "../src/providers/openai-compat";

// 模拟 fetch 以测试 SSE 解析
function createMockStream(chunks: string[]) {
  let idx = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (idx >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: new TextEncoder().encode(chunks[idx++]) };
        },
      }),
    },
    ok: true,
    status: 200,
  } as unknown as Response;
}

describe("DeepSeekProvider SSE parsing", () => {
  beforeEach(() => {
    // @ts-expect-error mock global fetch
    globalThis.fetch = undefined;
  });

  it("parses text chunks from SSE stream", async () => {
    const provider = new DeepSeekProvider("http://test", "fake-key");
    let fetchCalled = false;

    // @ts-expect-error mock global fetch
    globalThis.fetch = async () => {
      fetchCalled = true;
      return createMockStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    };

    const events: Array<{ type: string; content: string }> = [];
    for await (const ev of provider.chat([{ role: "user", content: "hi" }], { model: "deepseek-chat" })) {
      if (ev.type === "text") events.push({ type: ev.type, content: ev.content });
    }

    expect(fetchCalled).toBe(true);
    expect(events).toEqual([
      { type: "text", content: "Hello" },
      { type: "text", content: " World" },
    ]);
  });

  it("handles reasoning_content from DeepSeek", async () => {
    const provider = new DeepSeekProvider("http://test", "fake-key");

    // @ts-expect-error mock global fetch
    globalThis.fetch = async () => createMockStream([
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: Array<{ type: string; content: string }> = [];
    for await (const ev of provider.chat([{ role: "user", content: "hi" }], { model: "deepseek-chat" })) {
      events.push({ type: ev.type, content: ev.content });
    }

    expect(events[0]).toEqual({ type: "thinking", content: "Thinking..." });
    expect(events[1]).toEqual({ type: "text", content: "Answer" });
  });

  it("flushes remaining buffer after stream ends", async () => {
    const provider = new DeepSeekProvider("http://test", "fake-key");

    // 最后一行不以换行结尾 — 模拟 buffer 残留
    // @ts-expect-error mock global fetch
    globalThis.fetch = async () => createMockStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" last"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"word"}}]}',  // 不以换行结尾
    ]);

    const events: Array<{ type: string; content: string }> = [];
    for await (const ev of provider.chat([{ role: "user", content: "hi" }], { model: "deepseek-chat" })) {
      if (ev.type === "text") events.push({ type: ev.type, content: ev.content });
    }

    // 最后一个数据块应该被 flush 出来
    expect(events.some(e => e.content === "word")).toBe(true);
  });

  it("throws on API error", async () => {
    const provider = new DeepSeekProvider("http://test", "fake-key");

    // @ts-expect-error mock global fetch
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    const gen = provider.chat([{ role: "user", content: "hi" }], { model: "deepseek-chat" });
    await expect(gen.next()).rejects.toThrow("API error (401)");
  });
});

describe("OpenAICompatProvider SSE parsing", () => {
  it("parses tool_call chunks", async () => {
    const provider = new OpenAICompatProvider("openai", "http://test", "fake-key");

    // @ts-expect-error mock global fetch
    globalThis.fetch = async () => createMockStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"Read","arguments":"{\\"file_path\\":\\"test.txt\\"}"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const events: Array<{ type: string }> = [];
    for await (const ev of provider.chat([{ role: "user", content: "hi" }], { model: "gpt-4" })) {
      events.push({ type: ev.type });
    }

    expect(events.some(e => e.type === "tool_call")).toBe(true);
  });

  it("does not expose reasoning_content", async () => {
    const provider = new OpenAICompatProvider("openai", "http://test", "fake-key");
    expect(provider.supportsThinking()).toBe(false);
  });
});
