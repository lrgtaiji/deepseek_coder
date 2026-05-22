import { BaseTool, ToolResult } from "./base-tool";
import { spawn } from "node:child_process";

export class BashTool extends BaseTool {
  name = "Bash";
  description = `执行 Shell 命令。只能用于无交互的命令。
- 默认超时 120 秒
- 命令在项目目录中执行
- 输出超过 50KB 会被截断
- 如需后台执行使用 run_in_background 参数`;
  isReadOnly = false;
  requiresApproval = true;

  // 危险命令模式（直接匹配）
  private static dangerPatterns = [
    /rm\s+(-rf?\s+)?\//i,       // rm -rf /
    /curl\s+.*\|\s*(ba)?sh/i,   // curl | sh
    /wget\s+.*\|\s*(ba)?sh/i,   // wget | sh
    /sudo\s+/i,                  // sudo
    /chmod\s+777/i,             // chmod 777
    /mkfs\./i,                  // mkfs (格式化)
    /dd\s+if=/i,                // dd
    />\s*\/dev\/sd/i,           // 覆盖磁盘
    /:\(\)\s*\{/i,              // fork bomb
    /git\s+push\s+--force/i,    // force push
    /git\s+reset\s+--hard/i,    // hard reset
  ];

  // 间接执行危险命令检测
  private static indirectDangerPatterns = [
    /\bpython\d?\s+-c\s+['"].*\b(os\.system|subprocess|eval|exec)\b/i,
    /\bnode\s+-e\s+['"].*\b(child_process|exec|eval)\b/i,
    /\bperl\s+-e\s+['"].*\bsystem\b/i,
    /\bruby\s+-e\s+['"].*\b(system|exec|eval)\b/i,
    /\beval\s*\(/i,
  ];

  parameters = {
    command: {
      type: "string",
      description: "要执行的 shell 命令",
    },
    timeout: {
      type: "integer",
      description: "超时毫秒数（可选，默认 120000）",
    },

  };

  required = ["command"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args["command"] as string;
    const timeout = (args["timeout"] as number) ?? 120000;

    if (!command) {
      return { success: false, output: "Missing required parameter: command", truncated: false };
    }

    // 安全检查
    const dangerCheck = this.checkDangerous(command);
    if (dangerCheck) {
      return { success: false, output: `Dangerous command blocked: ${dangerCheck}`, truncated: false };
    }

    try {
      const result = await this.execWithTimeout(command, timeout);
      const { text, truncated } = this.truncate(result.stdout + result.stderr);
      return {
        success: result.exitCode === 0,
        output: text || `(exit code: ${result.exitCode})`,
        truncated,
      };
    } catch (err) {
      return {
        success: false,
        output: `Bash error: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }

  private checkDangerous(cmd: string): string | null {
    if (cmd.length > 2000) return "Command too long (potential DoS)";
    for (const pattern of BashTool.dangerPatterns) {
      const match = cmd.match(pattern);
      if (match) return match[0];
    }
    for (const pattern of BashTool.indirectDangerPatterns) {
      const match = cmd.match(pattern);
      if (match) return `Indirect dangerous command: ${match[0]}`;
    }
    return null;
  }

  private getShell(command: string): { cmd: string; args: string[] } {
    if (process.platform === "win32") {
      return { cmd: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", command] };
    }
    return { cmd: "bash", args: ["-c", command] };
  }

  private execWithTimeout(
    command: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const shell = this.getShell(command);
      const proc = spawn(shell.cmd, shell.args, {
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
