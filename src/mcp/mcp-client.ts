import { spawn, ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ToolDef } from "../tools/base-tool";
import { logger } from "../utils/logger";

// MCP 服务器配置
export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

// MCP 配置文件格式
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

// JSON-RPC 消息
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// 加载 MCP 配置
export function loadMCPConfig(): MCPConfig {
  const paths = [
    join(process.cwd(), ".ds-code", "mcp.json"),
    join(homedir(), ".ds-code", "mcp.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, "utf-8")); } catch { /* skip */ }
    }
  }
  return { mcpServers: {} };
}

// MCP 客户端 — 管理一个 MCP 服务器连接
export class MCPClient {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private serverName: string;
  private serverTools: ToolDef[] = [];

  constructor(name: string) { this.serverName = name; }

  get name(): string { return this.serverName; }
  get tools(): ToolDef[] { return this.serverTools; }

  async connect(config: MCPServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MCP ${this.serverName}: connection timeout`)), 15000);

      this.proc = spawn(config.command, config.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
      });

      this.proc.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.proc.stderr?.on("data", (data: Buffer) => {
        // MCP 服务器 stderr 用于日志，不影响通信
        if (process.env["DSCODE_MCP_DEBUG"]) {
          process.stderr.write(`[mcp:${this.serverName}] ${data.toString()}`);
        }
      });

      this.proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`MCP ${this.serverName}: ${err.message}`));
      });

      this.proc.on("close", (code) => {
        clearTimeout(timeout);
        for (const [, p] of this.pending) p.reject(new Error(`MCP ${this.serverName}: closed (code ${code})`));
        this.pending.clear();
      });

      // 发送 initialize 请求
      this.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "dscode", version: "1.0.0" },
      }).then(() => {
        this.sendNotification("notifications/initialized");
        clearTimeout(timeout);
        resolve();
      }).catch(reject);
    });
  }

  // 发现工具
  async discoverTools(): Promise<ToolDef[]> {
    const result = await this.send("tools/list") as { tools: Array<{ name: string; description?: string; inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] } }> } | undefined;
    if (!result?.tools) return [];

    this.serverTools = result.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: `mcp_${this.serverName}_${t.name}`,
        description: t.description ?? `MCP tool: ${t.name} (${this.serverName})`,
        parameters: {
          type: "object",
          properties: t.inputSchema.properties ?? {},
          required: t.inputSchema.required ?? [],
        },
      },
    }));

    return this.serverTools;
  }

  // 调用 MCP 工具
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const name = toolName.replace(`mcp_${this.serverName}_`, "");
    const result = await this.send("tools/call", { name, arguments: args }) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    if (!result?.content) return "(no output)";
    const text = result.content.map((c) => c.text ?? "").join("\n");
    return result.isError ? `Error: ${text}` : text;
  }

  async disconnect(): Promise<void> {
    for (const [, p] of this.pending) p.reject(new Error("Disconnected"));
    this.pending.clear();
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }

  // 发送 JSON-RPC 通知（无 id，不等待响应）
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.proc || this.proc.killed) return;
    const msg = { jsonrpc: "2.0", method, params };
    this.proc.stdin?.write(JSON.stringify(msg) + "\n");
  }

  // 发送 JSON-RPC 请求
  private send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.proc.killed) {
        reject(new Error(`MCP ${this.serverName}: not connected`));
        return;
      }
      const id = this.nextId++;
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin?.write(JSON.stringify(req) + "\n");
    });
  }

  // 处理响应缓冲区
  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (!pending) continue;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`MCP error: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      } catch (err) { logger.warn(`MCP "${this.serverName}" JSON parse error: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
}

// MCP 管理器 — 管理所有 MCP 连接
export class MCPManager {
  private clients: MCPClient[] = [];

  async start(config?: MCPConfig): Promise<MCPClient[]> {
    if (!config) config = loadMCPConfig();
    const entries = Object.entries(config.mcpServers).filter(([, c]) => c.enabled !== false);

    const results = await Promise.allSettled(
      entries.map(async ([name, cfg]) => {
        const client = new MCPClient(name);
        await client.connect(cfg);
        await client.discoverTools();
        return client;
      })
    );

    const connected: MCPClient[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === "fulfilled") {
        connected.push(r.value);
        this.clients.push(r.value);
      } else {
        const [name] = entries[i]!;
        logger.warn(`MCP ${name}: failed to connect — ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    }
    return connected;
  }

  // 收集所有 MCP 工具
  getAllTools(): ToolDef[] {
    return this.clients.flatMap((c) => c.tools);
  }

  // 查找工具对应的客户端
  findTool(toolName: string): MCPClient | undefined {
    return this.clients.find((c) => toolName.startsWith(`mcp_${c.name}_`));
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.disconnect()));
    this.clients = [];
  }
}
