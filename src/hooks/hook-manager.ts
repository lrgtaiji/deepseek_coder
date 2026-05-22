import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logger } from "../utils/logger";

export type HookEvent =
  | "SessionStart" | "SessionEnd" | "PreToolUse" | "PostToolUse"
  | "Notification" | "UserPromptSubmit";

export interface HookConfig {
  event: HookEvent;
  command: string;
  matcher?: string;
  timeout?: number;
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  sessionId: string;
  cwd: string;
}

// 危险命令黑名单模式
const HOOK_COMMAND_BLACKLIST = [
  /rm\s+(-rf?\s+)?\//i,
  /curl\s+.*\|\s*(ba)?sh/i,
  /wget\s+.*\|\s*(ba)?sh/i,
  /sudo\s+/i,
  /chmod\s+777/i,
  /mkfs\./i,
  /dd\s+if=/i,
  />\s*\/dev\/sd/i,
  /:\(\)\s*\{/i,
  /git\s+push\s+--force/i,
  /git\s+reset\s+--hard/i,
  /\b(echo|cat)\s+.*\|\s*(ba)?sh/i,
];

function isDangerousHookCommand(cmd: string): boolean {
  for (const p of HOOK_COMMAND_BLACKLIST) {
    if (p.test(cmd)) return true;
  }
  return false;
}

function loadHookConfig(): HookConfig[] {
  const paths = [join(homedir(), ".ds-code", "hooks.json"), join(process.cwd(), ".ds-code", "hooks.json")];
  for (const p of paths) {
    try { return JSON.parse(readFileSync(p, "utf-8")).hooks ?? []; } catch { /* file missing or invalid */ }
  }
  return [];
}

export class HookManager {
  private hooks: HookConfig[] = [];
  private sessionId: string;

  constructor(sessionId = "default") {
    this.sessionId = sessionId;
    this.hooks = loadHookConfig();
  }

  get count(): number { return this.hooks.length; }

  trigger(event: HookEvent, ctx?: Partial<HookContext>): void {
    this._run(event, ctx, false);
  }

  triggerSync(event: HookEvent, ctx?: Partial<HookContext>): void {
    this._run(event, ctx, true);
  }

  private _run(event: HookEvent, ctx?: Partial<HookContext>, sync = false): void {
    const context: HookContext = { event, sessionId: this.sessionId, cwd: process.cwd(), ...ctx };
    const matched = this.hooks.filter((h) => {
      if (h.event !== event) return false;
      if (h.matcher && context.toolName) {
        try { return new RegExp(h.matcher).test(context.toolName); } catch { return false; }
      }
      return true;
    });

    for (const hook of matched) {
      // 安全检查：拒绝明显危险的 hook 命令
      if (isDangerousHookCommand(hook.command)) {
        console.warn(`[hook] Blocked dangerous command: ${hook.command.slice(0, 80)}`);
        continue;
      }
      const timeout = sync ? 10000 : (hook.timeout ?? 30000);
      const env = {
        ...process.env,
        DSCODE_EVENT: context.event,
        DSCODE_SESSION: context.sessionId,
        DSCODE_CWD: context.cwd,
        DSCODE_TOOL_NAME: context.toolName ?? "",
        DSCODE_TOOL_INPUT: context.toolInput ? JSON.stringify(context.toolInput) : "",
        DSCODE_TOOL_OUTPUT: context.toolOutput ?? "",
      } as Record<string, string>;
      try { execSync(hook.command, { timeout, stdio: "ignore", env }); } catch (err) { logger.warn(`Hook execution failed: ${hook.command.slice(0, 80)} — ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
}
