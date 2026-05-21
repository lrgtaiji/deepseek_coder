import { BaseTool, ToolResult } from "./base-tool";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export class GrepTool extends BaseTool {
  name = "Grep";
  description = `用正则表达式搜索文件内容。
支持 glob 过滤、输出模式(content/files_with_matches/count)、上下文行(-A/-B/-C)。
默认输出匹配文件的路径列表。`;
  isReadOnly = true;
  requiresApproval = false;

  parameters = {
    pattern: {
      type: "string",
      description: "正则表达式搜索模式",
    },
    path: {
      type: "string",
      description: "搜索目录或文件路径（可选，默认为当前目录）",
    },
    glob: {
      type: "string",
      description: "Glob 过滤，如 *.ts、**/*.tsx（可选）",
    },
    output_mode: {
      type: "string",
      description: "输出模式: content/files_with_matches/count（默认 files_with_matches）",
    },
    "-A": {
      type: "integer",
      description: "每个匹配后显示的行数",
    },
    "-B": {
      type: "integer",
      description: "每个匹配前显示的行数",
    },
    "-C": {
      type: "integer",
      description: "每个匹配前后显示的行数",
    },
    "-i": {
      type: "boolean",
      description: "忽略大小写",
    },
    "-n": {
      type: "boolean",
      description: "显示行号",
    },
    head_limit: {
      type: "integer",
      description: "限制输出行数/文件数（默认 250）",
    },
  };

  required = ["pattern"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args["pattern"] as string;
    if (!pattern) {
      return { success: false, output: "Missing required parameter: pattern", truncated: false };
    }
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
          const content = readFileSync(file, "utf-8");
          const contentLines = content.split("\n");
          let fileMatches = 0;

          for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            if (!line) continue;

            const match = regex.test(line);
            if (!match) continue;

            fileMatches++;
            totalMatches++;

            if (outputMode === "count") continue;

            if (outputMode === "files_with_matches") {
              lines.push(file);
              break; // 找到匹配即跳到下一个文件
            }

            if (outputMode === "content") {
              const ctxBefore = Math.max(0, context || before);
              const ctxAfter = Math.max(0, context || after);

              if (fileMatches === 1) lines.push(`--- ${file} ---`);

              // 前文上下文
              for (let j = Math.max(0, i - ctxBefore); j < i; j++) {
                const prefixed = showLineNumbers ? `${j + 1}-` : "";
                lines.push(`${prefixed}${contentLines[j]}`);
              }

              // 匹配行
              const prefixed = showLineNumbers ? `${i + 1}:` : "";
              lines.push(`${prefixed}${line}`);

              // 后文上下文
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

    // 排除的目录
    const skipDirs = new Set(["node_modules", ".git", ".bun", "dist", "build", "__pycache__", ".next"]);

    try {
      const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") && entry !== ".") {
          if (!skipDirs.has(entry)) continue;
        }
        const full = join(dir, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            if (!skipDirs.has(entry)) {
              this.walkDir(full, results);
            }
          } else if (stat.isFile()) {
            results.push(full);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}
