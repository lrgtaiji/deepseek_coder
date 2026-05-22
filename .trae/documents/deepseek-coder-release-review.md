# DeepSeek Coder (DS Code) — 产品发布前全面复盘报告

## 一、项目架构总览

```
CLI入口 (commander.js)
    ├── 单次模式 (runSingleShot) — 流式输出到 stdout
    ├── 交互REPL模式 (runRepl) — readline + ANSI着色
    └── Ink UI模式 (App组件) — React + Ink TUI (未启用)

Agent Loop (核心循环)
    ├── Provider层: DeepSeek / OpenAI兼容
    ├── 工具系统: Read/Write/Edit/Glob/Grep/Bash/WebSearch/TodoWrite + MCP
    ├── 上下文压缩: 4层策略 (截断→去重→折叠→摘要)
    ├── 权限系统: 5种模式 + deny规则优先
    └── 协调器: 多Agent并行 (Orchestrator + SubAgent)

基础设施
    ├── 配置: Zod校验 + 分层合并 (默认→全局→项目→CLI)
    ├── 记忆: 文件化Markdown (global + project)
    ├── Skills: 内置 + 用户 + 项目 三级加载
    ├── 会话: JSONL存储 + 索引
    ├── Hooks: 事件驱动脚本执行
    └── 通知: 系统/Webhook/脚本
```

---

## 二、隐藏 Bug（严重级 — 必须修复）

### BUG-1: SSE 流未处理连接中断和超时 🔴

**文件**: [deepseek.ts:43](file:///d:/Claude_WORK/deepseek_coder/src/providers/deepseek.ts#L43), [openai-compat.ts:27](file:///d:/Claude_WORK/deepseek_coder/src/providers/openai-compat.ts#L27)

`fetch` 调用没有设置超时，如果API服务器挂起，Agent Loop会永远阻塞。没有 AbortSignal 传递到 fetch，也没有连接超时。

```typescript
// 当前: 无超时，可能永久阻塞
const response = await fetch(`${this.baseUrl}/v1/chat/completions`, { ... });

// 应该: 传递 signal + 设置超时
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 300000); // 5分钟
const response = await fetch(url, { ..., signal: controller.signal });
```

**影响**: 用户看到 "thinking..." 永远转圈，只能强制杀进程。

---

### BUG-2: SSE buffer 末尾数据丢失 🔴

**文件**: [deepseek.ts:70-71](file:///d:/Claude_WORK/deepseek_coder/src/providers/deepseek.ts#L70), [openai-compat.ts:57](file:///d:/Claude_WORK/deepseek_coder/src/providers/openai-compat.ts#L57)

当流结束时，如果 `buffer` 中仍有未处理的数据（不以 `\n` 结尾），这些数据会被静默丢弃。SSE标准中 `data:` 行可能不以换行结尾。

```typescript
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // ... 处理 buffer
}
// ⚠️ 此处 buffer 可能还有未处理的最后一行数据，被丢弃了
```

**修复**: 在 `while` 循环结束后，追加处理 `buffer` 中剩余内容。

---

### BUG-3: BashTool 在 Windows 上无法执行 🟡

**文件**: [bash.ts:90](file:///d:/Claude_WORK/deepseek_coder/src/tools/bash.ts#L90)

```typescript
const proc = spawn("bash", ["-c", command], { ... });
```

Windows 系统默认没有 `bash`，会直接报错 `ENOENT`。应该检测平台并使用 `cmd.exe` 或 `powershell.exe`。

---

### BUG-4: `/undo` 命令使用 `git checkout --` 会丢失未暂存修改 🟡

**文件**: [index.ts:384](file:///d:/Claude_WORK/deepseek_coder/src/index.ts#L384)

```typescript
execSync(`git checkout -- "${f}" 2>/dev/null`, ...);
execSync("git clean -fd 2>/dev/null", ...);
```

- `git checkout --` 会丢弃工作区修改，不可恢复
- `git clean -fd` 会删除未跟踪文件，非常危险
- 两者都没有用户确认步骤
- 在 Windows 上 git 命令需要适配

---

### BUG-5: 交互模式下 `conversationHistory` 不传回 Agent Loop 导致上下文断裂 🔴

**文件**: [index.ts:478](file:///d:/Claude_WORK/deepseek_coder/src/index.ts#L478)

```typescript
for await (const ev of agentLoop(provider, settings, tools, input, undefined, agentOpts, undefined, conversationHistory)) {
```

虽然传入了 `conversationHistory`，但 `agentLoop` 的 history 追加逻辑存在问题：
- 第一次调用时会清空 history 并重新构建 system prompt
- 后续调用会追加到 history，但不会重新注入 system prompt（因为 `history.length > 0` 分支跳过了 system prompt 构建）

```typescript
// agent-loop.ts:48-54
if (history && history.length > 0) {
  history.push({ role: "user", content: userContent });  // 只追加 user 消息
} else {
  // 只在新会话时构建 system prompt
  const systemContent = buildSystemPrompt(tools, settings.model, options);
  ...
}
```

这意味着一旦 history 有内容，后续轮次就不会再包含 system prompt，导致模型失去行为指引。

**实际上这个逻辑是正确的**（system prompt 在第一次已加入，后续追加消息时会保留），但有一个问题：**当 MCP 工具动态加入后，system prompt 不会更新**。

---

### BUG-6: `EditTool` 的 `split()` 方法在 old_string 包含正则特殊字符时行为异常 🟡

**文件**: [file-edit.ts:54](file:///d:/Claude_WORK/deepseek_coder/src/tools/file-edit.ts#L54)

```typescript
const count = content.split(oldStr).length - 1;
```

`String.split()` 的参数如果是正则特殊字符（如 `.`、`|`、`(`），会被当作正则模式而不是字面量匹配。例如搜索 `function(a.b)` 会匹配 `functionxaYbY` 等。

---

### BUG-7: GrepTool 的 `regex.lastIndex` 状态污染 🟡

**文件**: [grep.ts:74-94](file:///d:/Claude_WORK/deepseek_coder/src/tools/grep.ts#L74)

```typescript
const regex = new RegExp(pattern, "gm"); // 带 'g' 标志
// ...
const match = regex.test(line); // ⚠️ test() 会修改 lastIndex
```

当正则带 `g` 标志时，`regex.test()` 会修改 `lastIndex`，导致后续调用 `test()` 时跳过匹配。应该每次匹配重置 `lastIndex` 或使用 `match()` 代替。

---

### BUG-8: TodoWriteTool 使用静态属性，多实例/多会话共享导致冲突 🟡

**文件**: [todo-write.ts:48](file:///d:/Claude_WORK/deepseek_coder/src/tools/todo-write.ts#L48)

```typescript
static todos: TodoItem[] = [];
```

所有 TodoWriteTool 实例共享同一个静态数组，如果同时运行多个 Agent Loop（如 SubAgent），它们会互相覆盖对方的 todo 列表。

---

### BUG-9: `/compact` 命令只是伪造 token 计数，不实际压缩上下文 🟡

**文件**: [index.ts:372-374](file:///d:/Claude_WORK/deepseek_coder/src/index.ts#L372)

```typescript
"/compact": () => {
  console.log(M + gray + "Context compression triggered..." + reset);
  sessionTokens = Math.floor(sessionTokens * 0.4);  // 只是改了显示数字！
  prompt();
},
```

`/compact` 命令并没有真正压缩 `conversationHistory`，只是把 token 计数乘以 0.4，这是自欺欺人。用户以为上下文被压缩了，实际上完整的未压缩历史仍然发送给 API。

---

### BUG-10: `buildAgentOptions` 使用 `require()` 在 ESM 模块中 🟡

**文件**: [index.ts:120-136](file:///d:/Claude_WORK/deepseek_coder/src/index.ts#L120)

项目使用 `"type": "module"`，但 `buildAgentOptions()` 中使用了 `require()`。Bun 支持这种用法，但这不符合 ESM 规范，在其他运行时（Node.js）上会报错。

---

### BUG-11: SessionStore 的 `saveMessage` fallback 模式错误 🟡

**文件**: [session-store.ts:53](file:///d:/Claude_WORK/deepseek_coder/src/context/session-store.ts#L53)

```typescript
try { writeFileSync(path, JSON.stringify(msg) + "\n", { flag: "as" }); }
catch { writeFileSync(path, JSON.stringify(msg) + "\n", "utf-8"); }
```

fallback 的 `writeFileSync(path, data, "utf-8")` 没有 `{ flag: "as" }`，会覆盖文件而不是追加，导致之前的会话记录丢失。

---

### BUG-12: DeepSeek Provider 未发送 `initialized` 通知 🟡

**文件**: [mcp-client.ts:96-103](file:///d:/Claude_WORK/deepseek_coder/src/mcp/mcp-client.ts#L96)

MCP 客户端在收到 `initialize` 响应后，没有发送 `notifications/initialized` 通知，违反 MCP 协议规范。某些 MCP 服务器可能在收到此通知前不响应 `tools/list` 请求。

---

## 三、性能问题（影响用户体验）

### PERF-1: GrepTool 全量读取文件到内存 🔴

**文件**: [grep.ts:85](file:///d:/Claude_WORK/deepseek_coder/src/tools/grep.ts#L85)

```typescript
const content = readFileSync(file, "utf-8");
```

对于大文件（如日志文件、生成文件），`readFileSync` 会将整个文件读入内存。没有文件大小检查，可能 OOM。

**建议**: 
1. 跳过大于 1MB 的文件
2. 使用流式读取替代全量读取
3. 设计规格中提到使用 `ripgrep`，但实际是纯 JS 实现，性能差几个数量级

---

### PERF-2: GlobTool 同步递归遍历 + stat 每个文件 🔴

**文件**: [glob.ts:40-45](file:///d:/Claude_WORK/deepseek_coder/src/tools/glob.ts#L40)

```typescript
files.sort((a, b) => {
  try {
    return statSync(b).mtimeMs - statSync(a).mtimeMs;  // 每个文件都 stat！
  } catch { return 0; }
});
```

对于大型项目（如 node_modules 旁边），会对每个匹配文件做 `statSync`，非常慢。而且 GlobTool 没有排除 `node_modules`、`.git` 等目录。

---

### PERF-3: SkillsLoader 每次调用都重新读取磁盘 🟡

**文件**: [skills-loader.ts:47-49](file:///d:/Claude_WORK/deepseek_coder/src/config/skills-loader.ts#L47)

```typescript
get(name: string): Skill | undefined {
  return this.loadAll().find((s) => s.name === name);  // 每次都遍历文件系统
}
```

`loadAll()`、`listNames()`、`get()`、`buildSkillsPrompt()` 每次调用都重新扫描目录和读取文件，没有缓存。

---

### PERF-4: 会话索引每次保存都全量读写 🟡

**文件**: [session-store.ts:57-73](file:///d:/Claude_WORK/deepseek_coder/src/context/session-store.ts#L57)

```typescript
export function saveExchange(...) {
  // ...
  const idx = loadIndex();  // 全量读取
  // 修改
  saveIndex(idx);           // 全量写入
}
```

每次保存消息都会：读取完整索引 → 修改 → 写回完整索引。高频对话时 I/O 开销大。

---

### PERF-5: MemoryStore.updateIndex 正则注入风险 🟡

**文件**: [memory.ts:114](file:///d:/Claude_WORK/deepseek_coder/src/context/memory.ts#L114)

```typescript
const regex = new RegExp(`- \\[${entry.name}\\]\\([^)]+\\)[^\\n]*`, "g");
```

`entry.name` 来自用户输入，如果包含正则特殊字符，会导致正则构造失败或意外匹配。

---

## 四、代码质量问题

### QUALITY-1: 大量 `any` 类型断言 🔴

**文件**: 多处

- [agent-loop.test.ts:52](file:///d:/Claude_WORK/deepseek_coder/tests/agent-loop.test.ts#L52): `const events: any[] = []`
- [use-chat.ts:20](file:///d:/Claude_WORK/deepseek_coder/src/ui/hooks/use-chat.ts#L20): `provider: any, settings: any`
- [agent-loop.test.ts:49](file:///d:/Claude_WORK/deepseek_coder/tests/agent-loop.test.ts#L49): `as any`

项目启用了 `strict: true`，但测试和 UI 代码大量使用 `any`，削弱了类型安全。

---

### QUALITY-2: 错误处理不一致 🟡

- `buildAgentOptions()` 中用 `require()` + try/catch，静默忽略错误
- `MCPManager.start()` 用 `Promise.allSettled` 但只打印 warning
- `HookManager._run()` 完全吞掉 hook 执行错误
- `Notifier` 所有错误都静默

这些静默错误在调试时极度困难。建议至少记录到日志文件。

---

### QUALITY-3: 重复的 Provider 代码 🟡

[deepseek.ts](file:///d:/Claude_WORK/deepseek_coder/src/providers/deepseek.ts) 和 [openai-compat.ts](file:///d:/Claude_WORK/deepseek_coder/src/providers/openai-compat.ts) 的 SSE 解析逻辑几乎完全相同（60+ 行重复），只有 `reasoning_content` 处理不同。应提取公共基类。

---

### QUALITY-4: 设计规格与实现不一致 🟡

设计规格中列出的以下组件未实现：
- `context-builder.ts` — 实际没有此文件
- `stream-handler.ts` — 实际没有此文件  
- `task-decomposer.ts` — 实际没有此文件
- `AgentTool` — 设计中列为写入工具，未实现
- `SkillTool` — 设计中列出，未实现
- `WebFetchTool` — 设计中列出，未实现
- `anthropic.ts` Provider — 设计中列出，未实现
- `sandbox.ts` — 设计中列出，未实现
- Shift+Enter 换行、Ctrl+O 切换模式、Ctrl+V 贴图 — 设计中列出，未实现

---

### QUALITY-5: 版本号不统一 🟡

- [package.json:3](file:///d:/Claude_WORK/deepseek_coder/package.json#L3): `"version": "1.0.0"`
- [index.ts:22](file:///d:/Claude_WORK/deepseek_coder/src/index.ts#L22): `const VERSION = "1.0.0"`
- [app.tsx:50](file:///d:/Claude_WORK/deepseek_coder/src/ui/app.tsx#L50): `v0.3.0`
- [chat-view.tsx:17](file:///d:/Claude_WORK/deepseek_coder/src/ui/components/chat-view.tsx#L17): `v0.3.0`

---

## 五、安全漏洞

### SEC-1: API Key 可能泄露到日志 🟡

**文件**: [settings.ts:98-103](file:///d:/Claude_WORK/deepseek_coder/src/config/settings.ts#L98)

`/config` 命令会显示 `baseUrl`，虽然没有直接显示 apiKey，但在错误消息和调试输出中，apiKey 可能通过 `fetch` 错误信息泄露。

---

### SEC-2: Hook 命令注入 🟡

**文件**: [hook-manager.ts:74](file:///d:/Claude_WORK/deepseek_coder/src/hooks/hook-manager.ts#L74)

```typescript
execSync(hook.command, { ... });
```

hook 配置中的 `command` 直接通过 `execSync` 执行，没有做任何安全检查。恶意 `.ds-code/hooks.json` 可以执行任意命令。

---

### SEC-3: Notifier 脚本注入 🟡

**文件**: [notify.ts:84](file:///d:/Claude_WORK/deepseek_coder/src/tools/notify.ts#L84)

```typescript
execSync(this.script, { ... });
```

自定义通知脚本直接执行，与 Hook 问题相同。

---

### SEC-4: Bash 工具危险命令检测可绕过 🟡

**文件**: [bash.ts:15-27](file:///d:/Claude_WORK/deepseek_coder/src/tools/bash.ts#L15)

以下绕过方式未检测：
- `s\udo` (反斜杠绕过)
- `r''m -rf /` (引号绕过)
- 通过环境变量 `LD_PRELOAD` 
- `python -c "import os; os.system('rm -rf /')"`
- `node -e "require('child_process').execSync('rm -rf /')"`

---

### SEC-5: Windows PowerShell 通知命令注入 🟡

**文件**: [notify.ts:42](file:///d:/Claude_WORK/deepseek_coder/src/tools/notify.ts#L42)

```typescript
execSync(`powershell -c "New-BurntToastNotification -Text '${title}', '${body.replace(/'/g, "''")}'"`, ...);
```

虽然有单引号转义，但 `body` 中的其他特殊字符（如 `)`、`"`）可能导致 PowerShell 注入。

---

## 六、测试覆盖缺口

### 缺失的关键测试

| 模块 | 缺失测试 | 严重性 |
|------|----------|--------|
| DeepSeekProvider | SSE 流式解析、连接中断、超时 | 🔴 高 |
| OpenAICompatProvider | 同上 | 🔴 高 |
| MCPClient | JSON-RPC 通信、工具发现、断线重连 | 🔴 高 |
| SessionStore | 并发写入、索引一致性 | 🟡 中 |
| HookManager | 事件触发、matcher匹配、超时 | 🟡 中 |
| Notifier | 系统通知、webhook、脚本执行 | 🟡 中 |
| MemoryStore | 并发安全、frontmatter解析边界 | 🟡 中 |
| Orchestrator | 并行执行、冲突检测、任务分解 | 🟡 中 |
| SubAgentManager | 隔离性、超时回收 | 🟡 中 |
| Agent Loop | 上下文压缩实际触发、权限拦截 | 🟡 中 |
| 整合测试 | 端到端对话流、多轮工具调用 | 🔴 高 |

### 现有测试问题

1. **测试用了 `/tmp` 路径** — Windows 上 `/tmp` 不存在
2. **MockProvider 不验证消息格式** — 无法发现消息构造错误
3. **没有负向测试** — 如：超大文件、二进制文件、编码错误
4. **context.test.ts 中 SkillsLoader 测试依赖文件系统** — 可能因环境不同而失败

---

## 七、实现优先级排序

### P0 — 发布阻塞（必须修复）

| # | 问题 | 修复方案 |
|---|------|----------|
| 1 | SSE 流无超时 (BUG-1) | 给 fetch 添加 AbortController + 5分钟超时 |
| 2 | SSE buffer 末尾数据丢失 (BUG-2) | 流结束后处理 buffer 残留数据 |
| 3 | Windows 平台不兼容 (BUG-3) | BashTool 检测平台，Windows 用 powershell |
| 4 | GrepTool regex.lastIndex 污染 (BUG-7) | 用 `match()` 替代 `test()` 或重置 lastIndex |
| 5 | EditTool split 特殊字符 (BUG-6) | 改用 `indexOf` 计数或转义 split 参数 |
| 6 | /compact 不真正压缩 (BUG-9) | 实际调用 ContextCompressor 压缩 history |

### P1 — 发布前建议修复

| # | 问题 | 修复方案 |
|---|------|----------|
| 7 | GrepTool 大文件 OOM (PERF-1) | 限制文件大小 + 优先集成 ripgrep |
| 8 | GlobTool 不排除 node_modules (PERF-2) | 添加默认排除目录 + 去掉 mtime 排序 |
| 9 | SessionStore fallback 覆盖文件 (BUG-11) | fallback 也使用 append 模式 |
| 10 | MCP initialized 通知缺失 (BUG-12) | 连接后发送 `notifications/initialized` |
| 11 | 版本号不统一 (QUALITY-5) | 统一为 1.0.0 |
| 12 | Provider 代码重复 (QUALITY-3) | 提取 SSE 解析到公共基类 |

### P2 — 发布后改进

| # | 问题 | 修复方案 |
|---|------|----------|
| 13 | TodoWriteTool 静态属性 (BUG-8) | 改为实例属性或会话级存储 |
| 14 | SkillsLoader 无缓存 (PERF-3) | 添加首次加载缓存 |
| 15 | 测试覆盖不足 | 补充 Provider/MCP/集成测试 |
| 16 | 安全加固 (SEC-1~5) | 日志脱敏 + 白名单机制 |
| 17 | Hook/Notifier 命令注入 (SEC-2,3) | 添加命令白名单或沙箱 |
| 18 | 设计规格与实现对齐 (QUALITY-4) | 更新设计文档或补齐实现 |

---

## 八、改进建议详细方案

### 方案 1: Provider SSE 解析重构

提取公共 SSE 解析器，解决 BUG-1、BUG-2、QUALITY-3：

```typescript
// providers/sse-parser.ts
export class SSEParser {
  parse(chunk: string): { events: ParsedEvent[]; buffer: string } { ... }
  flush(): ParsedEvent[] { ... }  // 处理 buffer 残留
}

// providers/base-stream-provider.ts  
export abstract class BaseStreamProvider implements LLMProvider {
  protected async *streamChat(messages, options, signal?): AsyncGenerator<StreamChunk> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    const response = await fetch(url, { ..., signal: controller.signal });
    // ... 通用 SSE 解析
    // 流结束后 flush buffer
  }
}
```

### 方案 2: BashTool 跨平台支持

```typescript
private getShell(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    return { cmd: "powershell.exe", args: ["-NoProfile", "-Command", command] };
  }
  return { cmd: "bash", args: ["-c", command] };
}
```

### 方案 3: /compact 真正压缩上下文

```typescript
"/compact": () => {
  if (conversationHistory.length > 10) {
    const compressed = ContextCompressor.collapseToolRounds(conversationHistory);
    conversationHistory.length = 0;
    conversationHistory.push(...compressed);
    sessionTokens = estimateMessageTokens(conversationHistory);
    console.log(M + gray + `Compressed: ${conversationHistory.length} messages` + reset);
  }
  prompt();
},
```

### 方案 4: GrepTool 使用 ripgrep

设计规格明确写了 "代码搜索: ripgrep"，但当前是纯 JS 实现。应该：
1. 优先尝试调用系统 `rg` 命令
2. 如果不可用，降级到纯 JS 实现（但加文件大小限制）

```typescript
async execute(args) {
  if (this.hasRipgrep()) {
    return this.executeWithRipgrep(args);
  }
  return this.executeFallback(args);  // 纯 JS，加 1MB 限制
}
```

### 方案 5: 测试框架改进

1. 创建 `tests/helpers/mock-provider.ts` — 更完善的 Mock，支持断言消息格式
2. 创建 `tests/helpers/temp-fs.ts` — 跨平台临时文件管理
3. 添加 `tests/providers/` — Provider SSE 解析测试
4. 添加 `tests/mcp/` — MCP 通信测试
5. 添加 `tests/integration/` — 端到端对话流测试

---

## 九、架构改进建议

### 1. 日志系统

当前项目没有任何日志系统，所有错误都被 `catch {}` 静默吞掉。建议：

```typescript
// src/utils/logger.ts
export const logger = {
  debug: (msg: string, ...args) => { if (process.env.DSCODE_DEBUG) console.error(`[DEBUG] ${msg}`, ...args); },
  warn: (msg: string, ...args) => console.error(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args) => console.error(`[ERROR] ${msg}`, ...args),
};
```

通过 `DSCODE_DEBUG=1` 环境变量控制调试输出，方便用户反馈问题时开启。

### 2. 事件总线

Hook 系统目前只在 REPL 模式使用，且是同步阻塞的。建议改为异步事件总线：

```typescript
// Agent Loop 中发出事件
this.emit('PreToolUse', { toolName, toolInput });
// Hook/通知/日志都通过事件总线订阅
```

### 3. 工具注册机制

当前工具注册是硬编码的 `createTools()` 函数，建议改为声明式注册：

```typescript
// tools/index.ts
export const builtinTools = [ReadTool, WriteTool, EditTool, ...];
// 运行时动态加载
```

---

## 十、总结

### 项目亮点 ✅

1. **架构清晰** — Agent Loop + Provider + Tools 的分层设计合理
2. **权限系统完善** — 5级权限 + deny优先原则，安全性考量到位
3. **上下文压缩** — 4层策略设计精巧，token 预算管理有前瞻性
4. **MCP 集成** — JSON-RPC 客户端实现完整，可扩展性好
5. **Skills 系统** — 三级加载 + SKILL.md 格式，灵活性高
6. **Zod 校验** — 配置系统类型安全，有良好的默认值

### 发布前必须解决 ❌

1. **SSE 流无超时** — 用户会遭遇永久挂起
2. **Windows 不兼容** — BashTool 在 Windows 完全无法使用
3. **GrepTool 正则状态污染** — 搜索结果会不正确
4. **/compact 虚假压缩** — 用户以为压缩了实际没有
5. **SSE 末尾数据丢失** — 可能丢失模型最后的输出

### 建议的发布流程

1. 修复 P0 全部 6 个阻塞问题
2. 修复 P1 中的 #7 (Grep 大文件) 和 #9 (SessionStore 覆盖)
3. 统一版本号为 1.0.0
4. 补充 Provider SSE 解析的单元测试
5. 在 Windows 环境做一轮完整的功能验证
6. 发布 v1.0.0-beta，收集用户反馈
