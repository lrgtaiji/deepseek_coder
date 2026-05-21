import { BaseTool, ToolResult } from "./base-tool";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export class GlobTool extends BaseTool {
  name = "Glob";
  description = "按 glob 模式匹配文件，返回按修改时间排序的文件路径列表";
  isReadOnly = true;
  requiresApproval = false;

  parameters = {
    pattern: {
      type: "string",
      description: "Glob 模式，如 **/*.ts、src/**/*.tsx",
    },
    path: {
      type: "string",
      description: "搜索起始目录（可选，默认为当前工作目录）",
    },
  };

  required = ["pattern"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args["pattern"] as string;
    const basePath = (args["path"] as string) ?? process.cwd();

    if (!pattern) {
      return { success: false, output: "Missing required parameter: pattern", truncated: false };
    }

    try {
      const files = this.glob(basePath, pattern);

      if (files.length === 0) {
        return { success: true, output: `No files matching: ${pattern}`, truncated: false };
      }

      // 按修改时间降序排列
      files.sort((a, b) => {
        try {
          return statSync(b).mtimeMs - statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });

      const { text, truncated } = this.truncate(files.join("\n"));
      return { success: true, output: text, truncated };
    } catch (err) {
      return {
        success: false,
        output: `Glob error: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }

  // 简单的 glob 实现，支持 ** 和 *
  private glob(baseDir: string, pattern: string): string[] {
    const results: string[] = [];
    const parts = pattern.replace(/\\/g, "/").split("/");
    this.walk(baseDir, baseDir, parts, 0, results);
    return results;
  }

  private walk(
    rootDir: string,
    currentDir: string,
    parts: string[],
    idx: number,
    results: string[]
  ): void {
    if (idx >= parts.length) {
      results.push(currentDir);
      return;
    }

    const part = parts[idx]!;

    if (part === "**") {
      // 匹配当前目录
      this.walk(rootDir, currentDir, parts, idx + 1, results);

      // 递归子目录
      try {
        for (const entry of readdirSync(currentDir)) {
          const full = join(currentDir, entry);
          try {
            if (statSync(full).isDirectory() && !entry.startsWith(".")) {
              this.walk(rootDir, full, parts, idx, results);
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
      return;
    }

    try {
      for (const entry of readdirSync(currentDir)) {
        if (entry.startsWith(".") && !part.startsWith(".")) continue;

        if (this.matchSegment(entry, part)) {
          const full = join(currentDir, entry);
          if (idx === parts.length - 1) {
            results.push(relative(rootDir, full));
          } else {
            try {
              if (statSync(full).isDirectory()) {
                this.walk(rootDir, full, parts, idx + 1, results);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  private matchSegment(name: string, pattern: string): boolean {
    if (pattern === "*") return true;
    // 简单通配符匹配
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
    );
    return regex.test(name);
  }
}
