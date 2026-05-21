# DeepCode CLI — 设计规格说明

## 概述

DeepCode CLI 是一款面向专业开发者的终端 AI 编程助手，DeepSeek-V4 模型优先，对标 Claude Code 的 Agent 循环架构，以多 Agent 协作编排为核心差异化。

## 技术选型

- **语言**: TypeScript (strict mode)
- **运行时**: Bun
- **终端 UI**: React + Ink
- **CLI 解析**: Commander.js
- **Schema 校验**: Zod v4
- **代码搜索**: ripgrep

## 架构总览

```
终端 UI (React + Ink)
       │
查询引擎 (Agent Loop: while tool_call)
       │
协调器 (多 Agent 编排: 分解/分派/合并)
       │
工具系统 (文件IO/搜索/Shell/Agent/Skill)
       │
模型适配层 (DeepSeek/OpenAI兼容/Anthropic)
```

## 核心组件

### 1. 查询引擎 (engine/)

- `agent-loop.ts`: 核心 while(tool_call) 循环，模型自主决策，不设意图分类器
- `context-builder.ts`: 组装 system prompt + CLAUDE.md + 记忆 + 历史消息
- `stream-handler.ts`: 处理 SSE 流式响应，解析 tool_call 增量

### 2. 协调器 (coordinator/)

- `orchestrator.ts`: 识别可并行子任务，管理子 Agent 生命周期
- `task-decomposer.ts`: LLM 驱动的任务拆分（可选，默认由模型自行判断）
- `sub-agent.ts`: 独立 Agent Loop 实例，限定上下文和文件范围

触发方式: 显式分配 | 自动识别 | `/parallel` 手动指令

子 Agent 约束: depth=1，只读共享，写入隔离，超时回收

### 3. 工具系统 (tools/)

| 工具 | I/O | 需确认 | 说明 |
|------|-----|--------|------|
| ReadTool | 只读 | 否 | 文件读取，支持分页/图片/PDF |
| GlobTool | 只读 | 否 | 文件名 glob 匹配 |
| GrepTool | 只读 | 否 | ripgrep 内容搜索 |
| WebSearchTool | 只读 | 否 | 网络搜索 |
| WebFetchTool | 只读 | 否 | URL 内容抓取 |
| WriteTool | 写入 | 是 | 文件创建/覆盖 |
| EditTool | 写入 | 是 | 精确字符串替换 |
| BashTool | 写入 | 是 | Shell 执行(超时+沙箱) |
| AgentTool | 写入 | 是 | 派生子 Agent |
| SkillTool | 写入 | 否 | 调用 Skills |

并发策略: 只读工具并行执行，写入工具串行执行

### 4. 安全模型

四层防线: 权限模式 → 规则匹配 → 确认弹窗 → 沙箱执行

权限模式: plan / default / acceptEdits / auto / allowAll

核心原则: deny > ask > allow，最严格规则胜出，跨会话不保留

Bash 安全: 命令过滤、危险模式检测、路径限制、超时控制(120s)、输出截断(50KB)

### 5. 上下文管理

Token 预算: ~128K (System 5-8K + CLAUDE.md 1-5K + 历史 70-80K + 工具输出 15-20K + 响应 15-20K)

四层压缩:
1. 历史剪裁 — 大工具输出压缩为摘要
2. 冗余消除 — 连续重复调用合并
3. 上下文折叠 — 任务-调用-结果压缩为单条
4. LLM 摘要 — flash 模型压缩到 ~3K tokens

### 6. 记忆系统

文件化存储 (Markdown + YAML frontmatter)，不引入向量数据库

类型: user / feedback / project / reference

范围: `~/.deepcode/memory/` (个人) + `./.deepcode/memory/` (项目)

### 7. Skills 系统

分层: `~/.deepcode/skills/` (用户级) + `./.deepcode/skills/` (项目级) + `skills/` (内置)

每个 Skill 为 SKILL.md 格式，通过 `/` 菜单或 `/skill-name` 调用

### 8. 配置系统

优先级: CLI 参数 > 环境变量 > `./.deepcode/settings.json` > `~/.deepcode/settings.json` > 默认值

### 9. 模型适配层

统一 `LLMProvider` 接口，DeepSeek 优先实现

DeepSeek 特性: thinking mode, reasoning effort (max/high/medium/min), context caching

### 10. 终端 UI

快捷键: Enter(发送), Shift+Enter(换行), Esc(中断), Ctrl+O(切换模式), Ctrl+V(贴图), Ctrl+C(退出), /(命令面板)

斜杠命令: /help, /clear, /resume, /compact, /mode, /skills, /memory, /config, /cost, /plan, /parallel, /diff, /undo, /status, /exit

## 目录结构

```
deepseek-coder/
├── src/
│   ├── index.ts
│   ├── ui/
│   │   ├── app.tsx
│   │   ├── components/
│   │   └── hooks/
│   ├── engine/
│   │   ├── agent-loop.ts
│   │   ├── context-builder.ts
│   │   └── stream-handler.ts
│   ├── coordinator/
│   │   ├── orchestrator.ts
│   │   ├── task-decomposer.ts
│   │   └── sub-agent.ts
│   ├── tools/
│   │   ├── base-tool.ts
│   │   ├── file-read.ts
│   │   ├── file-edit.ts
│   │   ├── file-write.ts
│   │   ├── glob.ts
│   │   ├── grep.ts
│   │   ├── bash.ts
│   │   ├── web-search.ts
│   │   └── agent-tool.ts
│   ├── providers/
│   │   ├── base-provider.ts
│   │   ├── deepseek.ts
│   │   ├── openai-compat.ts
│   │   └── anthropic.ts
│   ├── context/
│   │   ├── token-counter.ts
│   │   ├── compressor.ts
│   │   └── memory.ts
│   ├── config/
│   │   ├── settings.ts
│   │   └── skills-loader.ts
│   └── permissions/
│       ├── permission-manager.ts
│       └── sandbox.ts
├── skills/
├── docs/superpowers/specs/
├── package.json
├── tsconfig.json
└── bun.lock
```

## 开发阶段

| Phase | 内容 | 交付物 |
|-------|------|--------|
| 1: 骨架 | CLI 入口、配置加载、单轮对话 | `deepcode "hello"` 返回回复 |
| 2: 核心循环 | Agent Loop + 6 个基础工具 | 能在项目中改代码 |
| 3: 终端 UI | React+Ink、流式显示、快捷键 | 完整终端交互 |
| 4: 上下文 | Token 计数、压缩、Skills | 大型代码库可用 |
| 5: 协调器 | 子 Agent、并行、冲突处理 | 多 Agent 协作 |
| 6: 完善 | 权限、记忆、Web 搜索、多模态 | 可发布 v1.0 |
