import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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
      try { execSync(hook.command, { timeout, stdio: "ignore", env }); } catch { /* skip */ }
    }
  }
}
