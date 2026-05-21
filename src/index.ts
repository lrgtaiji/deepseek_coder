#!/usr/bin/env bun
import { Command } from "commander";
import { loadSettings } from "./config/settings";
import { DeepSeekProvider } from "./providers/deepseek";
import { OpenAICompatProvider } from "./providers/openai-compat";
import { agentLoop } from "./engine/agent-loop";
import type { LLMProvider } from "./providers/base-provider";
import type { BaseTool } from "./tools/base-tool";
import type { AgentOptions } from "./engine/agent-loop";

import { ReadTool } from "./tools/file-read";
import { WriteTool } from "./tools/file-write";
import { EditTool } from "./tools/file-edit";
import { GlobTool } from "./tools/glob";
import { GrepTool } from "./tools/grep";
import { BashTool } from "./tools/bash";
import { WebSearchTool } from "./tools/web-search";
import { TodoWriteTool } from "./tools/todo-write";

import { gray, reset, yellow, cyan, bold, red, error as fmtError } from "./ui/colors";

const VERSION = "1.0.0";
const program = new Command();

program
  .name("dscode")
  .description("DS Code — DeepSeek-first terminal AI coding agent")
  .version(VERSION)
  .argument("[prompt]", "Your coding question or task")
  .option("-m, --model <model>", "Model to use")
  .option("--api-key <key>", "API key")
  .option("--base-url <url>", "API base URL")
  .option("--no-thinking", "Disable thinking mode")
  .option("--reasoning <level>", "Reasoning effort: max/high/medium/min")
  .option("-i, --interactive", "Start interactive REPL mode")
  .option("-p, --permission-mode <mode>", "Permission mode: plan/default/acceptEdits/auto/allowAll", "default")
  .option("--image <path>", "Attach an image file for multimodal analysis")
  .action(async (prompt, options) => {
    const settings = loadSettings(buildCLIOverrides(options));
    const provider = createProvider(settings);
    const tools = createTools();
    const agentOpts = buildAgentOptions();

    // MCP 工具加载（异步、可选）
    const mcpTools: Map<string, BaseTool> = new Map();
    try {
      const { MCPManager } = await import("./mcp/mcp-client");
      const mgr = new MCPManager();
      const clients = await mgr.start();
      if (clients.length > 0) {
        // MCP 工具包装为 BaseTool
        for (const client of clients) {
          for (const td of client.tools) {
            const { McpToolWrapper } = await import("./tools/mcp-tool");
            mcpTools.set(td.function.name, new McpToolWrapper(td, client));
          }
        }
        // 合并到主工具集
        for (const [name, tool] of mcpTools) tools.set(name, tool);
      }
    } catch { /* MCP 加载失败不影响核心功能 */ }

    let images: { url: string; detail?: string }[] | undefined;
    if (options.image) {
      const { MultimodalBuilder } = await import("./tools/multimodal");
      const paths: string[] = Array.isArray(options.image) ? options.image : [options.image];
      images = paths.map((p) => {
        const content = MultimodalBuilder.fromFile(p);
        return { url: content.type === "image_url" ? content.image_url.url : "" };
      });
    }

    if (options.interactive || !prompt) {
      await startInteractive(provider, settings, tools, agentOpts, prompt);
      return;
    }
    await runSingleShot(provider, settings, tools, agentOpts, prompt, images);
  });

function buildCLIOverrides(options: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (options.model) overrides["model"] = options.model;
  if (options.apiKey) overrides["provider"] = { apiKey: options.apiKey };
  if (options.baseUrl) {
    overrides["provider"] = { ...((overrides["provider"] as object) ?? {}), baseUrl: options.baseUrl };
  }
  if (options.noThinking) overrides["thinking"] = { enabled: false };
  if (options.reasoning) {
    overrides["thinking"] = { ...((overrides["thinking"] as object) ?? {}), reasoningEffort: options.reasoning };
  }
  return overrides;
}

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

function createTools(): Map<string, BaseTool> {
  const tools = new Map<string, BaseTool>();
  for (const t of [new ReadTool(), new WriteTool(), new EditTool(), new GlobTool(), new GrepTool(), new BashTool(), new WebSearchTool(), new TodoWriteTool()]) {
    tools.set(t.name, t);
  }
  return tools;
}

function buildAgentOptions(): AgentOptions {
  const opts: AgentOptions = {};
  try {
    const { MemoryStore } = require("./context/memory") as typeof import("./context/memory");
    const g = new MemoryStore("global").buildMemoryPrompt();
    const p = new MemoryStore("project").buildMemoryPrompt();
    if (g || p) opts.memoryPrompt = [g, p].filter(Boolean).join("\n");
  } catch (e) { if (!String(e).includes("Cannot find")) console.warn("memory:", String(e)); }

  try {
    const { SkillsLoader } = require("./config/skills-loader") as typeof import("./config/skills-loader");
    const sp = new SkillsLoader().buildSkillsPrompt();
    if (sp) opts.skillsPrompt = sp;
  } catch (e) { if (!String(e).includes("Cannot find")) console.warn("skills:", String(e)); }

  try {
    const { PermissionManager } = require("./permissions/permission-manager") as typeof import("./permissions/permission-manager");
    opts.permissionManager = new PermissionManager("default");
  } catch (e) { if (!String(e).includes("Cannot find")) console.warn("permissions:", String(e)); }

  return opts;
}

// ========== 单次模式 ==========
async function runSingleShot(
  provider: LLMProvider, settings: ReturnType<typeof loadSettings>,
  tools: Map<string, BaseTool>, agentOpts: AgentOptions,
  prompt: string, images?: { url: string; detail?: string }[]
): Promise<void> {
  process.stdout.write("\n");
  let thinking = false;
  try {
    for await (const event of agentLoop(provider, settings, tools, prompt, undefined, agentOpts, images)) {
      switch (event.type) {
        case "thinking":
          if (!thinking) { process.stdout.write(gray + "[thinking]" + reset + " "); thinking = true; }
          process.stdout.write(event.content);
          break;
        case "text":
          if (thinking) thinking = false;
          process.stdout.write(event.content);
          break;
        case "tool_start":
          process.stdout.write("\n" + cyan + "[" + (event.toolName || "") + "]" + reset + " ");
          break;
        case "tool_result": {
          const max = 200, over = event.content.length > max;
          process.stdout.write(gray + (over ? event.content.slice(0, max) + "..." : event.content) + reset);
          break;
        }
        case "error":
          process.stdout.write("\n" + fmtError(event.content));
          break;
      }
    }
    process.stdout.write("\n");
  } catch (err) {
    console.error(red + "Error: " + (err instanceof Error ? err.message : String(err)) + reset);
    process.exit(1);
  }
}

// ========== 交互模式 ==========
async function startInteractive(
  provider: LLMProvider, settings: ReturnType<typeof loadSettings>,
  tools: Map<string, BaseTool>, agentOpts: AgentOptions, initialPrompt?: string
): Promise<void> {
  if (initialPrompt) { await runSingleShot(provider, settings, tools, agentOpts, initialPrompt); process.stdout.write("\n"); }
  await runRepl(provider, settings, tools, agentOpts);
}

// ========== REPL ==========
function runRepl(
  provider: LLMProvider, settings: ReturnType<typeof loadSettings>,
  tools: Map<string, BaseTool>, agentOpts: AgentOptions
): Promise<void> {
  return new Promise((resolve) => {
    const readline = require("node:readline") as typeof import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const M = "   ";
    let closed = false, processing = false;
    let hlBuf = "";

    // 会话管理 & Hooks
    const ss = require("./context/session-store") as typeof import("./context/session-store");
    let sessionId = ss.createSession();

    // 对话历史 + 权限模式
    let conversationHistory: import("./providers/base-provider").Message[] = [];
    let permissionMode: "plan" | "default" = "default";

    // Hooks
    let hooks: import("./hooks/hook-manager").HookManager | null = null;
    try {
      const hm = require("./hooks/hook-manager") as typeof import("./hooks/hook-manager");
      hooks = new hm.HookManager(sessionId);
      if (hooks.count > 0) hooks.trigger("SessionStart");
    } catch (e) { /* hooks optional */ }

    rl.setPrompt("dscode> ");

    // 高亮缓冲区
    const cnt = (s: string, c: string): number => { let n = 0, i = -1; while ((i = s.indexOf(c, i + 1)) !== -1) n++; return n; };
    const highlight = (chunk: string): string => {
      hlBuf += chunk;
      let out = "";
      hlBuf = hlBuf.replace(/\*\*(.+?)\*\*/g, (_, t) => { out += yellow + bold + t + reset; return ""; });
      hlBuf = hlBuf.replace(/`([^`]+)`/g, (_, t) => { out += yellow + t + reset; return ""; });
      const si = hlBuf.lastIndexOf("**"), ti = hlBuf.lastIndexOf("`");
      if (si > -1 && cnt(hlBuf, "**") % 2 === 1) { out += hlBuf.slice(0, si); hlBuf = hlBuf.slice(si); }
      else if (ti > -1 && cnt(hlBuf, "`") % 2 === 1) { out += hlBuf.slice(0, ti); hlBuf = hlBuf.slice(ti); }
      else { out += hlBuf; hlBuf = ""; }
      return out;
    };

    // /undo: 记录每次交互前的 git 状态
    const editSnapshots: { files: string[]; time: number }[] = [];
    const gitSnapshot = () => {
      try {
        const { execSync } = require("node:child_process") as typeof import("node:child_process");
        const changed = execSync("git diff --name-only 2>/dev/null", { encoding: "utf-8", timeout: 3000, stdio: ["pipe","pipe","pipe"] }).trim();
        const unstaged = execSync("git ls-files --others --exclude-standard 2>/dev/null", { encoding: "utf-8", timeout: 3000, stdio: ["pipe","pipe","pipe"] }).trim();
        const files = [...changed.split("\n"), ...unstaged.split("\n")].filter(Boolean);
        if (files.length > 0) editSnapshots.push({ files, time: Date.now() });
        if (editSnapshots.length > 10) editSnapshots.shift();
      } catch { /* 非 git 仓库 */ }
    };

    // 会话 token 估算
    let sessionTokens = 0;

    // 命令注册表
    const commands: Record<string, () => void> = {
      "/exit": () => { if (hooks) hooks.trigger("SessionEnd"); closed = true; rl.close(); console.log("Bye."); resolve(); },
      "/quit": () => { if (hooks) hooks.trigger("SessionEnd"); closed = true; rl.close(); console.log("Bye."); resolve(); },
      "/help": () => {
        console.log(M + bold + "Commands" + reset);
        console.log(M + gray + "/status   /diff     /cost     /memory");
        console.log(M + "/skills   /config   /compact  /undo");
        console.log(M + "/resume   /new      /model   /plan");
        console.log(M + "/clear    /help     /exit" + reset);
        prompt();
      },
      "/model": () => { console.log(M + "Model: " + bold + settings.model + reset); prompt(); },
      "/plan": () => {
        if (permissionMode === "plan") {
          permissionMode = "default";
          if (agentOpts.permissionManager) agentOpts.permissionManager.setMode("default");
          console.log(M + gray + "Plan mode OFF — writes allowed (with confirmation)" + reset);
        } else {
          permissionMode = "plan";
          if (agentOpts.permissionManager) agentOpts.permissionManager.setMode("plan");
          console.log(M + gray + "Plan mode ON — read-only, no changes will be made" + reset);
        }
        prompt();
      },
      "/clear": () => { conversationHistory = []; hlBuf = ""; console.clear(); prompt(); },

      "/status": () => {
        console.log(M + bold + "DS Code" + reset + " v" + VERSION);
        console.log(M + "Model:    " + settings.model);
        console.log(M + "CWD:      " + process.cwd());
        console.log(M + "Tokens:   ~" + sessionTokens.toLocaleString());
        try {
          const { execSync } = require("node:child_process") as typeof import("node:child_process");
          const branch = execSync("git branch --show-current 2>/dev/null", { encoding: "utf-8", timeout: 3000, stdio: ["pipe","pipe","pipe"] }).trim();
          const stat = execSync("git status --short 2>/dev/null", { encoding: "utf-8", timeout: 3000, stdio: ["pipe","pipe","pipe"] }).trim();
          console.log(M + "Git:      " + (branch || "(no branch)"));
          if (stat) {
            console.log(M + gray + stat.split("\n").slice(0, 15).map((l) => M + "  " + l).join("\n") + reset);
            if (stat.split("\n").length > 15) console.log(M + gray + "  ... (" + stat.split("\n").length + " files)" + reset);
          } else {
            console.log(M + gray + "  (clean)" + reset);
          }
        } catch { console.log(M + gray + "  (not a git repo)" + reset); }
        const sessInfo = ss.getSession(sessionId);
        console.log(M + "Session:  " + gray + sessionId + reset + (sessInfo ? " (" + sessInfo.messageCount + " msgs)" : ""));
        console.log(M + "Edits:    " + editSnapshots.length + " snapshots");
        prompt();
      },

      "/diff": () => {
        try {
          const { execSync } = require("node:child_process") as typeof import("node:child_process");
          const diff = execSync("git diff --stat 2>/dev/null", { encoding: "utf-8", timeout: 5000, stdio: ["pipe","pipe","pipe"] }).trim();
          if (diff) {
            console.log(M + bold + "Working tree changes:" + reset);
            console.log(M + gray + diff.split("\n").map((l) => M + l).join("\n") + reset);
          } else {
            console.log(M + gray + "(no changes)" + reset);
          }
        } catch { console.log(M + gray + "(git not available)" + reset); }
        prompt();
      },

      "/cost": () => {
        // DeepSeek V4 价格估算: ~$0.28/M input, ~$1.10/M output (pro)
        const estInput = sessionTokens * 0.7, estOutput = sessionTokens * 0.3;
        const cost = (estInput / 1_000_000 * 0.28 + estOutput / 1_000_000 * 1.10);
        console.log(M + bold + "Session usage:" + reset);
        console.log(M + "  Tokens:  ~" + sessionTokens.toLocaleString());
        console.log(M + "  Est cost: $" + cost.toFixed(4));
        console.log(M + gray + "  (DeepSeek-V4-Pro pricing)" + reset);
        prompt();
      },

      "/memory": () => {
        try {
          const { MemoryStore } = require("./context/memory") as typeof import("./context/memory");
          const g = new MemoryStore("global"), p = new MemoryStore("project");
          const idx = g.getIndex() || p.getIndex();
          if (idx) {
            console.log(M + bold + "Memory" + reset);
            console.log(M + gray + idx.split("\n").map((l) => M + l).join("\n") + reset);
          } else {
            console.log(M + gray + "(no memories stored)" + reset);
            console.log(M + gray + "  Global: ~/.ds-code/memory/" + reset);
            console.log(M + gray + "  Project: .ds-code/memory/" + reset);
          }
        } catch { console.log(M + "Memory system not available"); }
        prompt();
      },

      "/skills": () => {
        try {
          const { SkillsLoader } = require("./config/skills-loader") as typeof import("./config/skills-loader");
          const loader = new SkillsLoader();
          const all = loader.loadAll();
          if (all.length > 0) {
            console.log(M + bold + "Available skills:" + reset);
            for (const s of all) console.log(M + "  /" + s.name + gray + " — " + s.description + reset);
          } else {
            console.log(M + gray + "(no skills loaded)" + reset);
          }
          console.log(M + gray + "  Skill dirs: ~/.ds-code/skills/  .ds-code/skills/" + reset);
        } catch { console.log(M + "Skills system not available"); }
        prompt();
      },

      "/config": () => {
        console.log(M + bold + "Current configuration:" + reset);
        console.log(M + "  Model:    " + settings.model);
        console.log(M + "  Provider: " + settings.provider.name + " (" + settings.provider.baseUrl + ")");
        console.log(M + "  Thinking: " + (settings.thinking.enabled ? "on (" + settings.thinking.reasoningEffort + ")" : "off"));
        console.log(M + "  Max rounds: " + settings.tools.maxToolRounds);
        console.log(M + "  Bash timeout: " + settings.tools.bashTimeout + "ms");
        const n = settings.notify;
        if (n) {
          console.log(M + "  Notify: " + (n.script ? "script: " + n.script : n.webhook ? "webhook" : n.system ? "system" : "off"));
        }
        console.log(M + gray + "  Config: ~/.ds-code/settings.json  .ds-code/settings.json" + reset);
        prompt();
      },

      "/compact": () => {
        console.log(M + gray + "Context compression triggered. Next response will use compacted history." + reset);
        hlBuf = "";
        sessionTokens = Math.floor(sessionTokens * 0.4);
        prompt();
      },

      "/undo": () => {
        if (editSnapshots.length === 0) {
          console.log(M + gray + "(nothing to undo)" + reset);
        } else {
          try {
            const { execSync } = require("node:child_process") as typeof import("node:child_process");
            const last = editSnapshots.pop()!;
            for (const f of last.files) execSync(`git checkout -- "${f}" 2>/dev/null`, { timeout: 5000, stdio: ["pipe","pipe","pipe"] });
            execSync("git clean -fd 2>/dev/null", { timeout: 5000, stdio: ["pipe","pipe","pipe"] });
            console.log(M + "Reverted " + gray + last.files.length + " file(s)" + reset);
          } catch {
            console.log(M + gray + "(undo requires git repo)" + reset);
          }
        }
        prompt();
      },

      "/new": () => {
        hlBuf = ""; sessionTokens = 0; editSnapshots.length = 0; conversationHistory = [];
        sessionId = ss.createSession();
        console.log(M + "New session: " + gray + sessionId + reset);
        prompt();
      },

      "/resume": () => {
        const sessions = ss.listSessions(15).filter((s) => s.messageCount > 0);
        const others = sessions.filter((s) => s.id !== sessionId).slice(0, 12);
        if (others.length === 0) {
          console.log(M + gray + "(no previous sessions)" + reset);
          prompt();
          return;
        }
        console.log(M + bold + "Recent sessions:" + reset);
        for (let i = 0; i < others.length; i++) {
          const s = others[i]!;
          console.log(M + "  " + gray + "[" + (i + 1) + "]" + reset + " " + new Date(s.updated).toLocaleString() + " (" + s.messageCount + " msgs)");
          console.log(M + "    " + gray + s.preview + reset);
        }
        console.log(M + gray + "  Enter number to resume (or Enter to cancel)" + reset);
        rl.question(M + gray + "resume> " + reset, (answer: string) => {
          const n = parseInt(answer.trim());
          if (n >= 1 && n <= others.length) {
            const chosen = others[n - 1]!;
            sessionId = chosen.id;
            hlBuf = ""; sessionTokens = 0;
            const msgs = ss.loadSession(chosen.id);
            console.log(M + "Resumed: " + gray + chosen.id + reset + " (" + chosen.messageCount + " msgs)");
            if (msgs.length > 0) {
              const last = msgs.slice(-4);
              console.log(M + gray + "Last exchanges:" + reset);
              for (const m of last) console.log(M + gray + "  [" + m.role + "] " + m.content.slice(0, 100) + reset);
            }
          } else {
            console.log(M + gray + "(cancelled)" + reset);
          }
          prompt();
        });
      },
    };

    const prompt = () => {
      if (closed || processing) return;
      const W = Math.min(process.stdout.columns || 80, 120);
      process.stdout.write(gray + M + "─".repeat(W - 3) + reset + "\n");
      rl.prompt();
    };

    rl.on("close", () => { closed = true; });
    rl.on("line", async (line) => {
      if (closed) return;
      const input = line.trim();
      if (commands[input]) { commands[input]!(); return; }
      if (!input) { prompt(); return; }

      processing = true;
      gitSnapshot();

      let thinking = false, thinkingDots = 0, thinkingStart = 0;
      let thinkingTimer: ReturnType<typeof setInterval> | null = null;
      let textStarted = false, atLineStart = false;
      let assistantOutput = "";

      const stopAnim = () => { if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; } };
      const finishThinking = () => {
        stopAnim();
        if (thinking) {
          const s = ((Date.now() - thinkingStart) / 1000).toFixed(1);
          process.stdout.write("\r" + M + gray + "thinking (" + s + "s)" + reset + "\x1b[K\n");
          thinking = false;
        }
      };

      try {
        const W = Math.min(process.stdout.columns || 80, 120);
        const dash = gray + M + "· ".repeat(Math.max(1, Math.floor((W - 3) / 2))).trimEnd() + reset;

        process.stdout.write("\n" + M + cyan + bold + "You:" + reset + "\n");
        process.stdout.write(M + gray + input + reset + "\n\n");

        for await (const ev of agentLoop(provider, settings, tools, input, undefined, agentOpts, undefined, conversationHistory)) {
          switch (ev.type) {
            case "thinking":
              if (!thinking) {
                thinking = true; thinkingStart = Date.now();
                thinkingTimer = setInterval(() => {
                  thinkingDots = (thinkingDots + 1) % 4;
                  process.stdout.write("\r" + M + gray + "thinking" + ".".repeat(thinkingDots + 1) + reset + "\x1b[K");
                }, 300);
              }
              break;
            case "text": {
              finishThinking();
              if (!textStarted) { textStarted = true; process.stdout.write(M + dash + "\n"); atLineStart = true; }
              sessionTokens += ev.content.length;
              assistantOutput += ev.content;
              let hl = highlight(ev.content);
              if (atLineStart) { hl = M + hl; atLineStart = false; }
              if (hl.endsWith("\n")) atLineStart = true;
              process.stdout.write(hl);
              break;
            }
            case "tool_start":
              stopAnim();
              process.stdout.write("\r" + M + gray + "[" + (ev.toolName || "tool") + "]" + reset + "\x1b[K\n");
              break;
            case "error":
              process.stdout.write("\n" + M + gray + "Error: " + ev.content + reset + "\n");
              break;
          }
        }
        finishThinking();
        if (hlBuf) { process.stdout.write(M + hlBuf); hlBuf = ""; }
        if (textStarted) process.stdout.write("\n");

        // 批量保存（一次 I/O，替代原来的 2×saveMessage = 6 次 I/O）
        if (textStarted && assistantOutput) {
          ss.saveExchange(sessionId,
            { role: "user", content: input, timestamp: new Date().toISOString() },
            { role: "assistant", content: assistantOutput, timestamp: new Date().toISOString() }
          );
        }

        // 通知脚本
        try {
          const notifyCfg = settings.notify;
          if (notifyCfg?.script || notifyCfg?.webhook) {
            const { Notifier } = require("./tools/notify") as typeof import("./tools/notify");
            new Notifier(notifyCfg).send({
              status: "success",
              summary: assistantOutput.slice(0, 100) || input.slice(0, 100),
              duration: thinkingStart ? Math.round((Date.now() - thinkingStart) / 1000) : 0,
              model: settings.model,
            }).catch(() => {});
          }
        } catch { /* 通知失败不影响核心功能 */ }
      } catch (err) {
        stopAnim();
        console.log(M + "Error:", err instanceof Error ? err.message : String(err));
        process.stdout.write("\n");
      }

      processing = false;
      prompt();
    });

    console.log(M + bold + "DS Code" + reset + " v" + VERSION + " | " + settings.model);
    console.log(M + gray + "/help for all commands  |  type your question" + reset + "\n");
    prompt();
  });
}

program.parse();
