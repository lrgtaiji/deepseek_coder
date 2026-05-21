# Phase 1: 项目骨架 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 DeepCode CLI 项目骨架，实现 `deepcode "hello"` 单轮对话返回 DeepSeek 回复

**Architecture:** CLI 入口(Commander.js) → 配置加载(settings.ts) → DeepSeek Provider → 简单对话(无工具) → 输出到终端

**Tech Stack:** TypeScript + Bun + Commander.js + Zod v4 + DeepSeek API (OpenAI 兼容)

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@vegamo/deepcode-cli",
  "version": "0.1.0",
  "description": "AI coding agent CLI tool — DeepSeek-first terminal programming assistant",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "deepcode": "./src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --watch run src/index.ts",
    "typecheck": "bun run tsc --noEmit"
  },
  "dependencies": {
    "commander": "^13.1.0",
    "zod": "^4.0.17"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 .gitignore**

```
node_modules/
dist/
.env
*.log
.bun/
```

- [ ] **Step 4: 安装依赖并验证**

Run: `cd D:/Claude_WORK/deepseek_coder && bun install`
Expected: 安装成功，生成 bun.lock

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run typecheck`
Expected: 无错误（当前无源文件）

---

### Task 2: 配置系统

**Files:**
- Create: `src/config/settings.ts`

- [ ] **Step 1: 创建 settings.ts**

```typescript
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Zod schema — 所有配置项的类型安全定义
const ProviderSchema = z.object({
  name: z.string().default("deepseek"),
  baseUrl: z.string().default("https://api.deepseek.com"),
  apiKey: z.string().default(""),
});

const ThinkingSchema = z.object({
  enabled: z.boolean().default(true),
  reasoningEffort: z.enum(["max", "high", "medium", "min"]).default("max"),
});

const ToolsSchema = z.object({
  bashTimeout: z.number().default(120000),
  maxToolRounds: z.number().default(25),
  sandbox: z.enum(["off", "docker"]).default("off"),
});

const SettingsSchema = z.object({
  model: z.string().default("deepseek-v4-pro"),
  provider: ProviderSchema.default({}),
  thinking: ThinkingSchema.default({}),
  tools: ToolsSchema.default({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

// 解析环境变量中的占位符（如 $DEEPSEEK_API_KEY）
function resolveEnvVars(value: string): string {
  return value.replace(/\$(\w+)/g, (_, name) => process.env[name] ?? "");
}

// 按优先级加载配置：默认值 → 全局配置 → 项目配置 → 环境变量 → CLI 参数
export function loadSettings(cliOverrides?: Partial<Settings>): Settings {
  const defaults: Partial<Settings> = {
    model: "deepseek-v4-pro",
    provider: {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: process.env["DEEPSEEK_API_KEY"] ?? "",
    },
    thinking: { enabled: true, reasoningEffort: "max" },
    tools: { bashTimeout: 120000, maxToolRounds: 25, sandbox: "off" },
  };

  // 1. 全局配置 (~/.deepcode/settings.json)
  const globalPath = join(homedir(), ".deepcode", "settings.json");
  let globalSettings: Partial<Settings> = {};
  if (existsSync(globalPath)) {
    try {
      globalSettings = JSON.parse(readFileSync(globalPath, "utf-8"));
    } catch {
      // 损坏的配置文件 → 忽略
    }
  }

  // 2. 项目配置 (./.deepcode/settings.json)
  const projectPath = join(process.cwd(), ".deepcode", "settings.json");
  let projectSettings: Partial<Settings> = {};
  if (existsSync(projectPath)) {
    try {
      projectSettings = JSON.parse(readFileSync(projectPath, "utf-8"));
    } catch {
      // 损坏的配置文件 → 忽略
    }
  }

  // 3. 合并（后面的覆盖前面的）
  const merged = {
    ...defaults,
    ...globalSettings,
    ...projectSettings,
    ...cliOverrides,
  };

  // 4. 解析环境变量占位符
  if (merged.provider?.apiKey) {
    merged.provider.apiKey = resolveEnvVars(merged.provider.apiKey);
  }

  // 5. Zod 校验 + 填充默认值
  return SettingsSchema.parse(merged);
}
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run typecheck`
Expected: 无错误

---

### Task 3: 模型适配层接口 + DeepSeek Provider

**Files:**
- Create: `src/providers/base-provider.ts`
- Create: `src/providers/deepseek.ts`
- Create: `src/providers/openai-compat.ts` (stub)

- [ ] **Step 1: 创建 base-provider.ts — 统一接口**

```typescript
// LLM 消息类型（OpenAI 兼容格式）
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  // DeepSeek 特有的 thinking 配置
  thinking?: {
    type: "enabled" | "disabled";
  };
  reasoningEffort?: "max" | "high" | "medium" | "min";
}

export interface StreamChunk {
  type: "text" | "thinking" | "tool_call" | "finish";
  content: string;
  toolCall?: Partial<ToolCall>;
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
```

- [ ] **Step 2: 创建 deepseek.ts — DeepSeek 实现**

```typescript
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
          yield { type: "finish", content: "" };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // DeepSeek thinking 内容 (reasoning_content)
          if (delta.reasoning_content) {
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
```

- [ ] **Step 3: 创建 openai-compat.ts — 通用 OpenAI 兼容 stub**

```typescript
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
          yield { type: "finish", content: "" };
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
```

- [ ] **Step 4: 验证编译**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run typecheck`
Expected: 无错误

---

### Task 4: 简单对话引擎（单轮，无工具）

**Files:**
- Create: `src/engine/agent-loop.ts`

- [ ] **Step 1: 创建 agent-loop.ts — Phase 1 单轮对话**

```typescript
import type { LLMProvider, Message, ChatOptions } from "../providers/base-provider";
import type { Settings } from "../config/settings";

// Phase 1: 最简单的对话 — 发送消息，流式输出回复，不涉及工具调用
export async function* simpleChat(
  provider: LLMProvider,
  settings: Settings,
  userMessage: string
): AsyncGenerator<string> {
  const messages: Message[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: userMessage,
    },
  ];

  const options: ChatOptions = {
    model: settings.model,
    temperature: 0.6,
    maxTokens: 8192,
  };

  // DeepSeek thinking 配置
  if (provider.supportsThinking() && settings.thinking.enabled) {
    options.thinking = { type: "enabled" };
    options.reasoningEffort = settings.thinking.reasoningEffort;
  }

  for await (const chunk of provider.chat(messages, options)) {
    if (chunk.type === "text") {
      yield chunk.content;
    }
  }
}

// 极简 system prompt — Phase 1 够用，后续阶段扩展
function buildSystemPrompt(): string {
  return [
    "You are DeepCode CLI, an AI coding assistant running in the terminal.",
    "You help users with software engineering tasks: writing code, debugging, refactoring, and explaining code.",
    "Current date: " + new Date().toISOString().split("T")[0],
    "",
    "Be concise. Use chinese for explanations, keep code identifiers in English.",
  ].join("\n");
}
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run typecheck`
Expected: 无错误

---

### Task 5: CLI 入口

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 创建 index.ts — CLI 入口**

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import { loadSettings } from "./config/settings";
import { DeepSeekProvider } from "./providers/deepseek";
import { OpenAICompatProvider } from "./providers/openai-compat";
import { simpleChat } from "./engine/agent-loop";
import type { LLMProvider } from "./providers/base-provider";

const program = new Command();

program
  .name("deepcode")
  .description("AI coding agent CLI tool")
  .version("0.1.0")
  .argument("[prompt]", "Your coding question or task")
  .option("-m, --model <model>", "Model to use")
  .option("--api-key <key>", "API key")
  .option("--base-url <url>", "API base URL")
  .option("--no-thinking", "Disable thinking mode")
  .option("--reasoning <level>", "Reasoning effort: max/high/medium/min")
  .action(async (prompt, options) => {
    if (!prompt) {
      // 交互模式入口（Phase 3 实现）
      console.log("DeepCode CLI v0.1.0");
      console.log("Interactive mode coming in Phase 3. Use: deepcode <prompt>");
      process.exit(0);
    }

    // 加载配置（CLI 参数覆盖）
    const cliOverrides: Record<string, unknown> = {};
    if (options.model) cliOverrides["model"] = options.model;
    if (options.apiKey) {
      cliOverrides["provider"] = { apiKey: options.apiKey };
    }
    if (options.baseUrl) {
      cliOverrides["provider"] = {
        ...((cliOverrides["provider"] as object) ?? {}),
        baseUrl: options.baseUrl,
      };
    }
    if (options.noThinking) {
      cliOverrides["thinking"] = { enabled: false };
    }
    if (options.reasoning) {
      cliOverrides["thinking"] = {
        ...((cliOverrides["thinking"] as object) ?? {}),
        reasoningEffort: options.reasoning,
      };
    }

    const settings = loadSettings(cliOverrides as Parameters<typeof loadSettings>[0]);

    // 创建 Provider
    const provider = createProvider(settings);

    // 流式输出回复
    try {
      for await (const text of simpleChat(provider, settings, prompt)) {
        process.stdout.write(text);
      }
      process.stdout.write("\n");
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Provider 工厂
function createProvider(settings: ReturnType<typeof loadSettings>): LLMProvider {
  const { name, baseUrl, apiKey } = settings.provider;

  if (!apiKey) {
    console.error("Error: No API key found. Set DEEPSEEK_API_KEY env var or --api-key flag.");
    process.exit(1);
  }

  switch (name) {
    case "deepseek":
      return new DeepSeekProvider(baseUrl, apiKey);
    case "openai":
    default:
      return new OpenAICompatProvider(name, baseUrl, apiKey);
  }
}

program.parse();
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run typecheck`
Expected: 无错误

---

### Task 6: 端到端验证

- [ ] **Step 1: 检查 DEEPSEEK_API_KEY 环境变量**

Run: `echo ${DEEPSEEK_API_KEY:0:10}...`
Expected: 显示 API key 前缀（已设置） 或 空（需设置）

- [ ] **Step 2: 运行单轮对话测试**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run src/index.ts "用一句话介绍你自己"`
Expected: 流式输出 DeepSeek 的中文回复

- [ ] **Step 3: 测试 CLI 参数覆盖**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run src/index.ts --no-thinking "1+1=?"`
Expected: 无 thinking 输出的回复（更快但无推理过程）

- [ ] **Step 4: 测试无参数交互模式入口**

Run: `cd D:/Claude_WORK/deepseek_coder && bun run src/index.ts`
Expected: 显示 "DeepCode CLI v0.1.0" 和交互模式提示
