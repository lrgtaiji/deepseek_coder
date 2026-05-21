import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Skill {
  name: string;
  description: string;
  content: string;  // SKILL.md 的完整内容
  path: string;     // 来源路径
}

// 分层 Skills 加载器
export class SkillsLoader {
  private builtinDir: string;
  private userDir: string;

  constructor() {
    this.builtinDir = join(import.meta.dirname ?? process.cwd(), "..", "..", "skills");
    this.userDir = join(homedir(), ".ds-code", "skills");
  }

  // 加载所有 Skills（内置 + 用户级 + 项目级）
  loadAll(projectDir?: string): Skill[] {
    const skills: Skill[] = [];

    // 1. 内置 Skills
    skills.push(...this.loadFromDir(this.builtinDir, "builtin"));

    // 2. 用户级 Skills
    skills.push(...this.loadFromDir(this.userDir, "user"));

    // 3. 项目级 Skills
    if (projectDir) {
      const projectSkillsDir = join(projectDir, ".ds-code", "skills");
      skills.push(...this.loadFromDir(projectSkillsDir, "project"));
    }

    return skills;
  }

  // 列出所有 Skill 名称
  listNames(): string[] {
    return this.loadAll().map((s) => s.name);
  }

  // 获取单个 Skill
  get(name: string): Skill | undefined {
    return this.loadAll().find((s) => s.name === name);
  }

  // 构建 Skills 注入到 system prompt 的内容
  buildSkillsPrompt(projectDir?: string): string {
    const skills = this.loadAll(projectDir);
    if (skills.length === 0) return "";

    const lines = ["", "## Available Skills", ""];
    for (const skill of skills) {
      lines.push(`### /${skill.name}`);
      lines.push(skill.description);
      lines.push("");
    }

    return lines.join("\n");
  }

  private loadFromDir(dir: string, scope: string): Skill[] {
    if (!existsSync(dir)) return [];

    const skills: Skill[] = [];
    try {
      for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry);
        try {
          if (!statSync(entryPath).isDirectory()) continue;
          const mdPath = join(entryPath, "SKILL.md");
          if (!existsSync(mdPath)) continue;

          const content = readFileSync(mdPath, "utf-8");
          const name = entry.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
          const descMatch = content.match(/description:\s*(.+)/);
          const description = descMatch?.[1]?.trim() ?? `${name} skill`;

          skills.push({
            name,
            description,
            content: `---\nscope: ${scope}\n---\n\n${content}`,
            path: mdPath,
          });
        } catch {
          // 跳过损坏的 skill
        }
      }
    } catch {
      // 目录读取失败
    }
    return skills;
  }
}
