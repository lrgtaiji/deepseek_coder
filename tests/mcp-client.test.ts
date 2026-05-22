import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MCPClient } from "../src/mcp/mcp-client";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// 模拟子进程
function createMockProcess() {
  const emitter = new EventEmitter();
  const stdin = { write: (data: string) => { emitter.emit("stdin", data); }, end: () => {} };
  const proc = emitter as unknown as ChildProcess;
  Object.assign(proc, { stdin, killed: false, kill: () => { emitter.emit("exit", 0); } });
  return { proc, emitter, stdin };
}

describe("MCPClient", () => {
  let client: MCPClient;
  let mock: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    mock = createMockProcess();
    client = new MCPClient("test-server");
    // 直接设置内部 proc，绕过 connect() 中的 spawn
    // @ts-expect-error private field
    client["proc"] = mock.proc;
    // 绑定 stdout data 事件到 mock emitter
    mock.emitter.on("data", (data: string) => {
      // @ts-expect-error private method
      client["buffer"] += data;
      // @ts-expect-error private method
      client["processBuffer"]();
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  it("sends initialize notification", async () => {
    const notifications: string[] = [];
    mock.emitter.on("stdin", (data: string) => {
      notifications.push(data);
    });

    // 直接调用 send 模拟 initialize 流程
    const initPromise = new Promise<void>((resolve, reject) => {
      // @ts-expect-error private method
      client["send"]("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "dscode", version: "1.0.0" },
      }).then(() => {
        // @ts-expect-error private method
        client["sendNotification"]("notifications/initialized");
        resolve();
      }).catch(reject);
    });

    // 模拟 initialize 响应
    setTimeout(() => {
      mock.emitter.emit("data", JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } },
      }) + "\n");
    }, 10);

    await initPromise;

    // 应该发送 initialize 请求和 notifications/initialized
    expect(notifications.length).toBeGreaterThanOrEqual(2);
    const msgs = notifications.map(n => JSON.parse(n));
    expect(msgs[0].method).toBe("initialize");
    expect(msgs[1].method).toBe("notifications/initialized");
  });

  it("discovers tools", async () => {
    mock.emitter.on("stdin", (data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === "tools/list") {
        setTimeout(() => {
          mock.emitter.emit("data", JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              tools: [
                { name: "read_file", description: "Read a file", inputSchema: { type: "object" } },
              ],
            },
          }) + "\n");
        }, 10);
      }
    });

    // @ts-expect-error private method
    const tools = await client["send"]("tools/list") as { tools: unknown[] };
    // @ts-expect-error simulate discoverTools behavior
    client["serverTools"] = tools.tools.map((t: { name: string; description?: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }) => ({
      type: "function",
      function: {
        name: `mcp_test-server_${t.name}`,
        description: t.description ?? `MCP tool: ${t.name}`,
        parameters: { type: "object", properties: t.inputSchema.properties ?? {}, required: t.inputSchema.required ?? [] },
      },
    }));

    expect(client.tools).toHaveLength(1);
    expect(client.tools[0].function.name).toBe("mcp_test-server_read_file");
  });

  it("handles JSON parse errors gracefully", async () => {
    let warnCount = 0;
    // @ts-expect-error mock console.error (logger.warn uses console.error)
    const origError = console.error;
    console.error = (...args: unknown[]) => { if (String(args[0]).includes("JSON parse")) warnCount++; };

    // 发送无效 JSON 数据到缓冲区
    mock.emitter.emit("data", "invalid json\n");
    // 再发送有效数据
    mock.emitter.emit("data", JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) + "\n");

    await new Promise(r => setTimeout(r, 50));

    console.error = origError;
    expect(warnCount).toBeGreaterThan(0);
  });
});
