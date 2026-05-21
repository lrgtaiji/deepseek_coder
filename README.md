# DS Code

<p align="center">
  <strong>专为 DeepSeek 打造的终端 AI Vibe Coding 工具</strong>
</p>

<p align="center">
  深度适配 DeepSeek V3/R1/V4 的 <strong>Thinking 模式</strong>与 <strong>推理强度控制</strong> · 完整 Agent 循环架构<br/>
  对标 Claude Code，但更懂国内开发者，更低成本，更快响应
</p>

---

## 为什么选择 DS Code？

- **专为 DeepSeek 而生** — 不做通用适配的"缝合怪"。针对 DeepSeek 的 thinking mode、reasoning effort、上下文缓存做了**原生级深度优化**
- **完整 Agent 循环** — while(tool_call) 架构，模型自主决定调用工具、读取文件、执行命令，直到任务完成
- **多 Agent 协作** — 子 Agent 隔离执行 + 并行分派 + 冲突合并，复杂重构再也不需要你来拆分
- **4 层上下文压缩** — 截断 → 去重 → 折叠 → LLM 摘要，128K 上下文窗口物尽其用
- **Vibe Coding 优先** — 一个命令描述需求，Agent 自己读代码、写代码、跑测试、修 bug，你只管验收

## 快速开始

```bash
# 安装
npm install -g @vegamo/ds-code

# 设置 API Key（支持 DeepSeek 官方 / 硅基流动 / 火山引擎等兼容平台）
export DEEPSEEK_API_KEY=sk-xxx

# Vibe 模式：一句话让 AI 干活
dscode "重构 src/engine/agent-loop.ts 的错误处理，加上 exponential backoff retry"

# 交互模式：进入对话式编程
dscode -i

# 查看所有选项
dscode --help
```

## 核心功能

### 🧠 Agent 循环引擎

```
User Prompt → Agent Loop → [Think → Tool Call]* → Response
                 ↑                        ↓
                 └── 上下文压缩 ← Token 预算 ←──┘
```

- **Thinking 模式** — 开启后模型在每次操作前进行深度推理，代码质量显著提升
- **推理强度可控** — `--reasoning max|high|medium|min`，复杂任务用 max，简单任务省 token
- **上下文缓存** — 复用对话前缀，大幅降低长会话成本
- **流式 SSE** — 实时看到 AI 的思考过程和工具调用

### 🛠️ 内置工具（开箱即用）

| 工具 | 说明 |
|------|------|
| **Read** | 文件读取，支持行号、分页、PDF/图片检测 |
| **Write** | 文件创建/覆盖，自动创建父目录 |
| **Edit** | 精确字符串替换，唯一性校验 + 全局替换 |
| **Glob** | 文件名模糊匹配，完整 `**` 递归支持 |
| **Grep** | ripgrep 风格正则搜索，上下文行、大小写控制 |
| **Bash** | Shell 命令执行，超时 + 危险命令拦截 |
| **WebSearch** | DuckDuckGo 免费搜索，联网获取最新文档和方案 |

### 🤖 多 Agent 协调器

复杂任务自动拆解为子任务，并行分派给独立的子 Agent 执行：

- 子 Agent 拥有独立上下文，互不干扰
- 并行执行，大幅缩短总耗时
- 内置冲突检测，自动合并结果
- 适合：跨模块重构、批量迁移、多文件测试修复

### 📦 上下文与记忆系统

- **4 层压缩策略**：截断（硬上限）→ 去重（相同文件折叠）→ 折叠（合并连续工具调用）→ LLM 摘要（智能压缩）
- **Token 预算管理**：设置上下文上限，系统自动压缩而非截断
- **记忆存储**：Markdown + YAML 文件化，支持用户级（`~/.ds-code/memory/`）和项目级（`./.ds-code/memory/`）

### ⚡ Skills 扩展系统

内置 20+ 专业 Skills，输入 `/` 即可调出：

| 分类 | Skills |
|------|--------|
| 开发流程 | brainstorming · writing-plans · executing-plans · finishing-a-development-branch |
| 代码质量 | code-review · requesting-code-review · receiving-code-review · simplify |
| 测试调试 | test · test-driven-development · debug · systematic-debugging |
| 文档优化 | document · explain · optimize · refactor |
| 高级能力 | dispatching-parallel-agents · subagent-driven-development · using-git-worktrees |

### 🔒 权限安全

4 层纵深防御，放心把终端交给 AI：

- **模式控制** — `plan`（只看不写）/ `default`（写文件需确认）/ `acceptEdits`（编辑自动通过）/ `auto`（全自动）/ `allowAll`（无限制）
- **规则拦截** — 可配置 deny 规则，如禁止特定目录写入
- **运行时确认** — 每个危险操作弹窗确认，不盲从
- **危险命令检测** — `rm -rf /`、`chmod 777` 等自动拦截

## 配置

配置文件优先级：**CLI 参数 > 环境变量 > `./.ds-code/settings.json` > `~/.ds-code/settings.json` > 默认值**

```json
{
  "model": "deepseek-v4-pro",
  "provider": {
    "name": "deepseek",
    "baseUrl": "https://api.deepseek.com",
    "apiKey": "$DEEPSEEK_API_KEY"
  },
  "thinking": {
    "enabled": true,
    "reasoningEffort": "max"
  },
  "tools": {
    "bashTimeout": 120000,
    "maxToolRounds": 25
  }
}
```

### 兼容平台

除了 DeepSeek 官方 API，也支持所有兼容 OpenAI 接口的国内平台：

- **硅基流动** (siliconflow) — `--base-url https://api.siliconflow.cn/v1`
- **火山引擎** (volcengine) — `--base-url https://ark.cn-beijing.volces.com/api/v3`
- **阿里百炼** — `--base-url https://dashscope.aliyuncs.com/compatible-mode/v1`
- 或其他任何 OpenAI 兼容接口

## 开发

```bash
git clone https://github.com/vegamo/ds-code.git
cd ds-code
bun install
bun run typecheck     # TypeScript strict 模式
bun test              # 单元测试
```

## 技术栈

| 层面 | 选型 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 运行时 | Bun |
| 终端 UI | React 19 + Ink 7 |
| CLI 框架 | Commander.js |
| 数据校验 | Zod v4 |
| 文本搜索 | ripgrep |

## 与同类工具的对比

| | DS Code | Claude Code | Cursor CLI | OpenCode |
|---|---|---|---|---|
| 首发适配 | **DeepSeek** | Claude | Claude/GPT | GPT |
| Thinking 优化 | **原生深度定制** | 无 | 无 | 无 |
| 多 Agent 协作 | **内置** | 无 | 无 | 无 |
| 上下文压缩 | **4 层渐进式** | 2 层 | 基础 | 基础 |
| Skills 系统 | **20+ 内置** | 无 | 无 | 无 |
| 权限安全 | **4 层防线** | 3 层 | 基础 | 基础 |
| 国内 API 成本 | **¥0.5-2/任务** | $3-15/任务 | $5-20/任务 | $2-10/任务 |

## License

MIT
