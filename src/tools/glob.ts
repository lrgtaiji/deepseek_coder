import { BaseTool, ToolResult } from "./base-tool";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".bun", "dist", "build", "__pycache__",
  ".next", ".nuxt", "target", "vendor", ".venv", "venv",
]);

export class GlobTool extends BaseTool {
  name = "Glob";
  description = "按 glob 模式匹配文件，返回文件路径列表（按修改时间排序）";
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

      if (files.length <= 200) {
        files.sort((a, b) => {
          try {
            return statSync(join(basePath, b)).mtimeMs - statSync(join(basePath, a)).mtimeMs;
          } catch {
            return 0;
          }
        });
      }

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
    if (results.length >= 1000) return;

    if (idx >= parts.length) {
      results.push(currentDir);
      return;
    }

    const part = parts[idx]!;

    if (part === "**") {
      this.walk(rootDir, currentDir, parts, idx + 1, results);

      try {
        for (const entry of readdirSync(currentDir)) {
          if (SKIP_DIRS.has(entry)) continue;
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
        if (results.length >= 1000) break;
        if (entry.startsWith(".") && !part.startsWith(".")) continue;
        if (SKIP_DIRS.has(entry)) continue;

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
    const regex = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
    );
    return regex.test(name);
  }
}
