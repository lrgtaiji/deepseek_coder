import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// 记忆条目类型
export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  name: string;
  description: string;
  type: MemoryType;
  content: string;
}

// 文件化记忆系统
export class MemoryStore {
  private baseDir: string;
  private indexPath: string;

  constructor(scope: "global" | "project" = "global") {
    if (scope === "global") {
      this.baseDir = join(homedir(), ".ds-code", "memory");
    } else {
      this.baseDir = join(process.cwd(), ".ds-code", "memory");
    }
    this.indexPath = join(this.baseDir, "MEMORY.md");
    this.ensureDir();
  }

  // 保存记忆
  save(entry: MemoryEntry): void {
    const frontmatter = [
      "---",
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      "metadata:",
      `  type: ${entry.type}`,
      "---",
      "",
      entry.content,
    ].join("\n");

    const filePath = join(this.baseDir, `${entry.name}.md`);
    writeFileSync(filePath, frontmatter, "utf-8");
    this.updateIndex(entry);
  }

  // 加载所有记忆（用于注入 system prompt）
  loadAll(): MemoryEntry[] {
    if (!existsSync(this.baseDir)) return [];

    const entries: MemoryEntry[] = [];
    try {
      for (const file of readdirSync(this.baseDir)) {
        if (file === "MEMORY.md" || !file.endsWith(".md")) continue;
        const content = readFileSync(join(this.baseDir, file), "utf-8");
        const parsed = this.parseFrontmatter(content);
        if (parsed) entries.push(parsed);
      }
    } catch {
      // 读取失败返回空
    }
    return entries;
  }

  // 获取索引（摘要）
  getIndex(): string {
    if (!existsSync(this.indexPath)) return "";
    try {
      return readFileSync(this.indexPath, "utf-8");
    } catch {
      return "";
    }
  }

  // 删除记忆
  delete(name: string): boolean {
    const filePath = join(this.baseDir, `${name}.md`);
    if (!existsSync(filePath)) return false;
    try {
      const { unlinkSync } = require("node:fs") as typeof import("node:fs");
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // 构建 memory 注入到 system prompt 的内容
  buildMemoryPrompt(): string {
    const entries = this.loadAll();
    if (entries.length === 0) return "";

    const lines = ["", "## Memory Context", ""];
    for (const entry of entries) {
      lines.push(`### ${entry.name} (${entry.type})`);
      lines.push(entry.description);
    }

    return lines.join("\n");
  }

  private ensureDir(): void {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private updateIndex(entry: MemoryEntry): void {
    const line = `- [${entry.name}](${entry.name}.md) — ${entry.description}`;
    let index = this.getIndex();
    if (index.includes(`[${entry.name}]`)) {
      const regex = new RegExp(`- \\[${this.escapeRegex(entry.name)}\\]\\([^)]+\\)[^\\n]*`, "g");
      index = index.replace(regex, line);
    } else {
      index = index ? index + "\n" + line : "# Memory Index\n\n" + line;
    }
    writeFileSync(this.indexPath, index, "utf-8");
  }

  private parseFrontmatter(content: string): MemoryEntry | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    try {
      const header = match[1]!;
      const body = match[2]!.trim();

      const nameMatch = header.match(/name:\s*(.+)/);
      const descMatch = header.match(/description:\s*(.+)/);
      const typeMatch = header.match(/type:\s*(.+)/);

      if (!nameMatch || !descMatch) return null;

      return {
        name: nameMatch[1]!.trim(),
        description: descMatch[1]!.trim(),
        type: (typeMatch?.[1]?.trim() as MemoryType) ?? "project",
        content: body,
      };
    } catch {
      return null;
    }
  }
}
