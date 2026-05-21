import { execSync, spawn } from "node:child_process";

export interface NotifyContext {
  status: "success" | "error";
  summary: string;
  duration: number;
  model: string;
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
        // PowerShell toast
        execSync(
          `powershell -c "New-BurntToastNotification -Text '${title}', '${body.replace(/'/g, "''")}'"`,
          { timeout: 5000, stdio: "ignore" }
        );
      } else if (process.platform === "darwin") {
        spawn("osascript", ["-e", `display notification "${body}" with title "${title}"`], { stdio: "ignore" });
      } else {
        spawn("notify-send", [title, body], { stdio: "ignore" });
      }
    } catch {
      // 通知工具不可用时静默忽略
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
    } catch { /* webhook 失败不影响核心功能 */ }
  }

  // 自定义脚本
  private async runScript(ctx: NotifyContext): Promise<void> {
    if (!this.script) return;
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
    } catch { /* 脚本失败不影响核心功能 */ }
  }
}
