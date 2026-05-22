import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
}

interface CacheEntry {
  skills: Skill[];
  mtime: number;
}

export class SkillsLoader {
  private builtinDir: string;
  private userDir: string;
  private cache = new Map<string, CacheEntry>();

  constructor() {
    this.builtinDir = join(import.meta.dirname ?? process.cwd(), "..", "..", "skills");
    this.userDir = join(homedir(), ".ds-code", "skills");
  }

  private getDirMtime(dir: string): number {
    if (!existsSync(dir)) return -1;
    try {
      let maxMtime = statSync(dir).mtimeMs;
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        try {
          if (statSync(p).isDirectory()) {
            const mdPath = join(p, "SKILL.md");
            if (existsSync(mdPath)) {
              maxMtime = Math.max(maxMtime, statSync(mdPath).mtimeMs);
            }
          }
        } catch { /* skip */ }
      }
      return maxMtime;
    } catch { return -1; }
  }

  private loadFromDirCached(dir: string, scope: string): Skill[] {
    const mtime = this.getDirMtime(dir);
    const cached = this.cache.get(dir);
    if (cached && cached.mtime === mtime) return cached.skills;

    const skills = this.loadFromDir(dir, scope);
    this.cache.set(dir, { skills, mtime });
    return skills;
  }

  loadAll(projectDir?: string): Skill[] {
    const skills: Skill[] = [];
    skills.push(...this.loadFromDirCached(this.builtinDir, "builtin"));
    skills.push(...this.loadFromDirCached(this.userDir, "user"));
    if (projectDir) {
      const projectSkillsDir = join(projectDir, ".ds-code", "skills");
      skills.push(...this.loadFromDirCached(projectSkillsDir, "project"));
    }
    return skills;
  }

  listNames(projectDir?: string): string[] {
    return this.loadAll(projectDir).map((s) => s.name);
  }

  get(name: string, projectDir?: string): Skill | undefined {
    return this.loadAll(projectDir).find((s) => s.name === name);
  }

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
        } catch { /* skip corrupt skill */ }
      }
    } catch { /* directory read failed */ }
    return skills;
  }
}
