// 权限系统 — 四层防线
// 核心原则: deny > ask > allow，最严格规则胜出

export type PermissionMode = "plan" | "default" | "acceptEdits" | "auto" | "allowAll";

export interface PermissionRule {
  tool: string;              // 工具名称或 "*" 通配
  action: "allow" | "deny" | "ask";
  pathPattern?: string;      // 路径匹配（用于文件工具）
}

export class PermissionManager {
  private mode: PermissionMode;
  private rules: PermissionRule[] = [];

  constructor(mode: PermissionMode = "default") {
    this.mode = mode;
    this.initDefaultRules();
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  // 检查工具是否需要确认
  // 核心原则: deny > ask > allow，deny 规则从不高优先级被覆盖
  check(toolName: string, toolIsReadOnly: boolean, filePath?: string): "allow" | "deny" | "ask" {
    // 第1步: 先检查 deny 规则（始终优先，任何模式下都生效）
    for (const rule of this.rules) {
      if (rule.action !== "deny") continue;
      if (rule.tool !== "*" && rule.tool !== toolName) continue;

      // 无路径限制的 deny 规则 → 无条件拒绝
      if (!rule.pathPattern) return "deny";

      // 有路径限制 → 仅当路径匹配时拒绝
      if (filePath) {
        const regex = new RegExp(rule.pathPattern);
        if (regex.test(filePath)) return "deny";
      }
    }

    // 第2步: 模式级别检查
    switch (this.mode) {
      case "plan":
        return toolIsReadOnly ? "allow" : "deny";
      case "allowAll":
        return "allow";
      case "auto":
        return toolIsReadOnly ? "allow" : "ask";
      case "acceptEdits":
        if (["Write", "Edit"].includes(toolName)) return "allow";
        return toolIsReadOnly ? "allow" : "ask";
      case "default":
      default:
        break;
    }

    // 第3步: 常规规则匹配
    let bestAction: "allow" | "deny" | "ask" = toolIsReadOnly ? "allow" : "ask";

    for (const rule of this.rules) {
      if (rule.action === "deny") continue; // deny 已在上面处理
      if (rule.tool !== "*" && rule.tool !== toolName) continue;

      if (rule.pathPattern && filePath) {
        const regex = new RegExp(rule.pathPattern);
        if (!regex.test(filePath)) continue;
      }

      if (rule.action === "ask") bestAction = "ask";
      if (rule.action === "allow" && bestAction !== "ask") bestAction = "allow";
    }

    return bestAction;
  }

  // 检查危险命令
  hasDangerousPatterns(command: string): string | null {
    const patterns: [RegExp, string][] = [
      [/rm\s+(-rf?\s+)?\/[^a-z]/i, "rm -rf /"],
      [/curl\s+.*\|\s*(ba)?sh/i, "curl | sh"],
      [/sudo\s+/i, "sudo"],
      [/chmod\s+777/i, "chmod 777"],
      [/mkfs\./, "mkfs"],
    ];

    for (const [pattern, name] of patterns) {
      if (pattern.test(command)) return name;
    }
    return null;
  }

  private initDefaultRules(): void {
    // 默认拒绝规则
    this.rules = [
      { tool: "*", action: "deny", pathPattern: "\\.env$" },
      { tool: "*", action: "deny", pathPattern: "\\.git/" },
      { tool: "*", action: "deny", pathPattern: "node_modules/" },
    ];
  }
}
