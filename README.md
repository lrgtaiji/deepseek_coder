# DS Code

**DeepSeek-first terminal AI coding agent** — 对标 Claude Code 的 Agent 循环架构，以多 Agent 协作编排为核心差异化。

## 安装

```bash
npm install -g @vegamo/ds-code
```

或使用 Bun：

```bash
bun install -g @vegamo/ds-code
```

## 快速开始

```bash
# 设置 API Key
export DEEPSEEK_API_KEY=sk-xxx

# 单次模式
dscode "重构 src/engine/agent-loop.ts 的错误处理"

# 交互模式
dscode -i
```

## 选项

| 选项 | 说明 |
|------|------|
| `-m, --model <model>` | 指定模型（默认 `deepseek-v4-pro`） |
| `--api-key <key>` | API Key |
| `--base-url <url>` | API 基础 URL |
| `--no-thinking` | 禁用 DeepSeek thinking 模式 |
| `--reasoning <level>` | 推理强度：max/high/medium/min |
| `-i, --interactive` | 启动交互式 REPL |
| `-p, --permission-mode <mode>` | 权限模式：plan/default/acceptEdits/auto/allowAll |

## 功能

### 核心 Agent 循环
- 多轮工具调用 (while tool_call)
- DeepSeek thinking mode + reasoning effort 控制
- 上下文缓存 (Context Caching)
- 流式 SSE 响应

### 工具系统 (7 个内置工具)
- **Read** — 文件读取（行号、分页、PDF/图片检测）
- **Write** — 文件创建/覆盖（自动创建父目录）
- **Edit** — 精确字符串替换（唯一性检查 + replace_all）
- **Glob** — 文件名匹配（`**` 递归支持）
- **Grep** — ripgrep 风格正则搜索（上下文行、大小写敏感）
- **Bash** — Shell 执行（超时控制 + 危险命令检测）
- **WebSearch** — DuckDuckGo 免费网络搜索

### 多 Agent 协调器
- 子 Agent 隔离管理
- 并行任务分派
- 冲突检测和结果合并

### 上下文管理
- 4 层压缩策略（截断 → 去重 → 折叠 → LLM 摘要）
- Token 计数 + 预算管理

### 记忆系统
- Markdown + YAML 文件化存储
- 用户级 (`~/.ds-code/memory/`) + 项目级 (`./.ds-code/memory/`)

### Skills 系统
- 3 层 Skills：内置 + 用户级 + 项目级
- `/` 命令面板调用

### 权限安全
- 4 层防线：模式 → deny 规则 → 确认 → 沙箱
- 5 种权限模式：plan/default/acceptEdits/auto/allowAll
- 危险命令自动拦截

## 配置

配置文件优先级：CLI 参数 > 环境变量 > `./.ds-code/settings.json` > `~/.ds-code/settings.json` > 默认值

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

## 开发

```bash
git clone <repo>
cd ds-code
bun install
bun run typecheck
bun test
```

## 技术栈

- **语言**: TypeScript (strict mode)
- **运行时**: Bun
- **终端 UI**: React + Ink
- **CLI**: Commander.js
- **校验**: Zod v4
- **搜索**: ripgrep
