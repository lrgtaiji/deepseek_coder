import { BaseTool, ToolResult } from "./base-tool";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync, execFileSync } from "node:child_process";

const MAX_FILE_SIZE = 1_024 * 1_024;
const SKIP_DIRS = new Set(["node_modules", ".git", ".bun", "dist", "build", "__pycache__", ".next"]);

function hasRipgrep(): boolean {
  try {
    execSync("rg --version", { timeout: 1000, stdio: "ignore" });
    return true;
  } catch { return false; }
}

export class GrepTool extends BaseTool {
  name = "Grep";
  description = `用正则表达式搜索文件内容。
支持 glob 过滤、输出模式(content/files_with_matches/count)、上下文行(-A/-B/-C)。
默认输出匹配文件的路径列表。
如有 ripgrep 可用，会优先使用以获得更好性能。`;
  isReadOnly = true;
  requiresApproval = false;

  private useRipgrep: boolean;

  constructor() {
    super();
    this.useRipgrep = hasRipgrep();
  }

  parameters = {
    pattern: { type: "string", description: "正则表达式搜索模式" },
    path: { type: "string", description: "搜索目录或文件路径（可选，默认为当前目录）" },
    glob: { type: "string", description: "Glob 过滤，如 *.ts、**/*.tsx（可选）" },
    output_mode: { type: "string", description: "输出模式: content/files_with_matches/count（默认 files_with_matches）" },
    "-A": { type: "integer", description: "每个匹配后显示的行数" },
    "-B": { type: "integer", description: "每个匹配前显示的行数" },
    "-C": { type: "integer", description: "每个匹配前后显示的行数" },
    "-i": { type: "boolean", description: "忽略大小写" },
    "-n": { type: "boolean", description: "显示行号" },
    head_limit: { type: "integer", description: "限制输出行数/文件数（默认 250）" },
  };

  required = ["pattern"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args["pattern"] as string;
    if (!pattern) {
      return { success: false, output: "Missing required parameter: pattern", truncated: false };
    }

    if (this.useRipgrep) {
      return this.executeWithRipgrep(args);
    }
    return this.executeFallback(args);
  }

  private executeWithRipgrep(args: Record<string, unknown>): ToolResult {
    const pattern = args["pattern"] as string;
    const searchPath = (args["path"] as string) ?? process.cwd();
    const globFilter = args["glob"] as string | undefined;
    const outputMode = (args["output_mode"] as string) ?? "files_with_matches";
    const after = (args["-A"] as number) ?? 0;
    const before = (args["-B"] as number) ?? 0;
    const context = (args["-C"] as number) ?? 0;
    const ignoreCase = (args["-i"] as boolean) ?? false;
    const headLimit = (args["head_limit"] as number) ?? 250;

    const cmdParts = ["rg", "--max-columns", "500", "-M", "1m"];

    if (ignoreCase) cmdParts.push("-i");
    if (outputMode === "files_with_matches") cmdParts.push("-l");
    if (outputMode === "count") cmdParts.push("-c");
    if (outputMode === "content") {
      cmdParts.push("-n");
      const ctxLines = Math.max(context, before, after);
      if (ctxLines > 0) cmdParts.push("-C", String(ctxLines));
      else cmdParts.push("-n");
    }

    // 排除目录
    for (const d of SKIP_DIRS) cmdParts.push("-g", `!${d}`);

    // glob 过滤
    if (globFilter) cmdParts.push("-g", globFilter);

    // head limit
    cmdParts.push("-m", String(headLimit));

    cmdParts.push(pattern, searchPath);

    try {
      const output = execFileSync(cmdParts[0]!, cmdParts.slice(1), {
        timeout: 30000,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        shell: false,
      });
      const lines = output.trim().split("\n").filter(Boolean);
      const prefix = outputMode === "count"
        ? `Found matches:\n`
        : outputMode === "files_with_matches"
          ? `Found ${lines.length} matching files:\n`
          : `Found matches:\n`;
      const { text, truncated } = this.truncate(prefix + lines.join("\n"));
      return { success: true, output: text, truncated };
    } catch (err) {
      // ripgrep 退出码 1 = 无匹配，这不算是错误
      if (typeof err === "object" && err && "status" in err && err.status === 1) {
        return { success: true, output: `No matches for "${pattern}"`, truncated: false };
      }
      // ripgrep 失败，降级到纯 JS
      return this.executeFallback(args);
    }
  }

  private executeFallback(args: Record<string, unknown>): ToolResult {
    const pattern = args["pattern"] as string;
    const searchPath = (args["path"] as string) ?? process.cwd();
    const globFilter = args["glob"] as string | undefined;
    const outputMode = (args["output_mode"] as string) ?? "files_with_matches";
    const after = (args["-A"] as number) ?? 0;
    const before = (args["-B"] as number) ?? 0;
    const context = (args["-C"] as number) ?? 0;
    const ignoreCase = (args["-i"] as boolean) ?? false;
    const showLineNumbers = (args["-n"] as boolean) ?? true;
    const headLimit = (args["head_limit"] as number) ?? 250;

    try {
      const flags = "gm" + (ignoreCase ? "i" : "");
      const regex = new RegExp(pattern, flags);
      const files = this.collectFiles(searchPath, globFilter);

      let totalMatches = 0;
      const lines: string[] = [];

      for (const file of files) {
        if (outputMode === "files_with_matches" && lines.length >= headLimit) break;

        try {
          const stat = statSync(file);
          if (stat.size > MAX_FILE_SIZE) continue;
          const content = readFileSync(file, "utf-8");
          const contentLines = content.split("\n");
          let fileMatches = 0;

          for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            if (!line) continue;

            regex.lastIndex = 0;
            if (!regex.test(line)) continue;

            fileMatches++;
            totalMatches++;

            if (outputMode === "count") continue;

            if (outputMode === "files_with_matches") {
              lines.push(file);
              break;
            }

            if (outputMode === "content") {
              const ctxBefore = Math.max(0, context || before);
              const ctxAfter = Math.max(0, context || after);

              if (fileMatches === 1) lines.push(`--- ${file} ---`);

              for (let j = Math.max(0, i - ctxBefore); j < i; j++) {
                const prefixed = showLineNumbers ? `${j + 1}-` : "";
                lines.push(`${prefixed}${contentLines[j]}`);
              }

              const prefixed = showLineNumbers ? `${i + 1}:` : "";
              lines.push(`${prefixed}${line}`);

              for (let j = i + 1; j < Math.min(contentLines.length, i + 1 + ctxAfter); j++) {
                const prefixed = showLineNumbers ? `${j + 1}-` : "";
                lines.push(`${prefixed}${contentLines[j]}`);
              }
            }

            if (lines.length >= headLimit) break;
          }

          if (outputMode === "count" && fileMatches > 0) {
            lines.push(`${file}:${fileMatches}`);
          }
        } catch { /* skip unreadable files */ }
      }

      if (totalMatches === 0) {
        return { success: true, output: `No matches for "${pattern}"`, truncated: false };
      }

      const prefix = outputMode === "count"
        ? `Found ${totalMatches} matches across ${lines.length} files:\n`
        : `Found ${totalMatches} matches:\n`;

      const { text, truncated } = this.truncate(prefix + lines.join("\n"));
      return { success: true, output: text, truncated };
    } catch (err) {
      return {
        success: false,
        output: `Grep error: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }

  private collectFiles(searchPath: string, globFilter?: string): string[] {
    const results: string[] = [];
    this.walkDir(searchPath, results);

    if (globFilter) {
      const regex = new RegExp(
        "^" + globFilter.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return results.filter((f) => regex.test(f));
    }
    return results;
  }

  private walkDir(dir: string, results: string[]): void {
    if (!existsSync(dir)) return;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") && !SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        try {
          const s = statSync(full);
          if (s.isDirectory()) {
            if (!SKIP_DIRS.has(entry)) this.walkDir(full, results);
          } else if (s.isFile()) {
            results.push(full);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}
