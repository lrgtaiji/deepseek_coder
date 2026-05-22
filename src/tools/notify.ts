import { execSync, spawn } from "node:child_process";
import { logger } from "../utils/logger";

export interface NotifyContext {
  status: "success" | "error";
  summary: string;
  duration: number;
  model: string;
}

// PowerShell 参数转义：将需要转义的字符转换为安全形式
function escapePsString(s: string): string {
  // PowerShell 中单引号通过双写转义
  return s.replace(/'/g, "''");
}

// 系统通知脚本命令黑名单
const SCRIPT_BLACKLIST = [
  /rm\s+(-rf?\s+)?\//i,
  /curl\s+.*\|\s*(ba)?sh/i,
  /sudo\s+/i,
  /mkfs\./i,
  />\s*\/dev\/sd/i,
];

function isDangerousScript(cmd: string): boolean {
  for (const p of SCRIPT_BLACKLIST) {
    if (p.test(cmd)) return true;
  }
  return false;
}

// 通知处理器
export class Notifier {
  private script?: string;
  private webhook?: string;
  private systemNotify: boolean;

  constructor(config?: { script?: string; webhook?: string; system?: boolean }) {
    this.script = config?.script;
    this.webhook = config?.webhook;
    this.systemNotify = config?.system ?? true;
  }

  async send(ctx: NotifyContext): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.systemNotify) promises.push(this.sendSystem(ctx));
    if (this.webhook) promises.push(this.sendWebhook(ctx));
    if (this.script) promises.push(this.runScript(ctx));

    await Promise.allSettled(promises);
  }

  // 系统通知 (Windows/macOS/Linux)
  private async sendSystem(ctx: NotifyContext): Promise<void> {
    const icon = ctx.status === "success" ? "✅" : "❌";
    const title = `DS Code ${icon}`;
    const body = `${ctx.summary.slice(0, 100)}\n${ctx.duration}s | ${ctx.model}`;

    try {
      if (process.platform === "win32") {
        const safeTitle = escapePsString(title);
        const safeBody = escapePsString(body);
        execSync(
          `powershell -NoProfile -Command "New-BurntToastNotification -Text '${safeTitle}', '${safeBody}'"`,
          { timeout: 5000, stdio: "ignore" }
        );
      } else if (process.platform === "darwin") {
        spawn("osascript", ["-e", `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`], { stdio: "ignore" });
      } else {
        spawn("notify-send", [title, body], { stdio: "ignore" });
      }
    } catch {
      // 通知工具不可用时记录日志
      logger.debug(`System notification failed: ${title}`);
    }
  }

  // Slack/Webhook 通知
  private async sendWebhook(ctx: NotifyContext): Promise<void> {
    if (!this.webhook) return;
    const color = ctx.status === "success" ? "#36a64f" : "#ff0000";
    try {
      await fetch(this.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [{
            color,
            title: `DS Code — ${ctx.status === "success" ? "Done" : "Error"}`,
            text: ctx.summary.slice(0, 500),
            fields: [
              { title: "Duration", value: `${ctx.duration}s`, short: true },
              { title: "Model", value: ctx.model, short: true },
            ],
            footer: "DS Code v1.0.0",
            ts: Math.floor(Date.now() / 1000),
          }],
        }),
      });
    } catch (err) { logger.warn(`Webhook failed: ${this.webhook?.slice(0, 40) ?? ""} — ${err instanceof Error ? err.message : String(err)}`); }
  }

  // 自定义脚本
  private async runScript(ctx: NotifyContext): Promise<void> {
    if (!this.script) return;
    // 安全检查
    if (isDangerousScript(this.script)) {
      console.warn(`[notify] Blocked dangerous script: ${this.script.slice(0, 80)}`);
      return;
    }
    try {
      execSync(this.script, {
        timeout: 30000,
        stdio: "ignore",
        env: {
          ...process.env,
          DSCODE_STATUS: ctx.status,
          DSCODE_SUMMARY: ctx.summary,
          DSCODE_DURATION: String(ctx.duration),
          DSCODE_MODEL: ctx.model,
        } as Record<string, string>,
      });
    } catch (err) { logger.warn(`Notification script failed: ${this.script?.slice(0, 40) ?? ""} — ${err instanceof Error ? err.message : String(err)}`); }
  }
}
