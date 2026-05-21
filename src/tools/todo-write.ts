import { BaseTool, ToolResult } from "./base-tool";

export interface TodoItem {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  activeForm?: string;
}

// TodoWrite 工具 — 让 Agent 追踪任务进度
export class TodoWriteTool extends BaseTool {
  name = "TodoWrite";
  description = `创建和管理结构化的任务列表来追踪进度。
每次处理复杂多步任务时使用此工具，将任务分解为可追踪的子任务。
参数:
- merge: true 则用新 tasks 合并到现有列表（按 id 匹配更新），false 则完全替换
- tasks: 待办事项数组，每项有 id/subject/description/status/activeForm`;

  isReadOnly = false;
  requiresApproval = false;

  parameters = {
    merge: {
      type: "boolean",
      description: "是否合并到现有列表（true=按 id 更新，false=完全替换）。默认 false",
    },
    tasks: {
      type: "array",
      description: "待办事项数组",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "唯一标识符（如 '1', '2', '3'）" },
          subject: { type: "string", description: "简短标题（祈使语气，如 '修复登录 bug'）" },
          description: { type: "string", description: "具体说明" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
          activeForm: { type: "string", description: "进行时的现在分词形式（如 '正在修复登录 bug'）" },
        },
        required: ["id", "subject", "status"],
      },
    },
  };

  required = ["merge", "tasks"];

  // 静态任务列表（会话全局共享）
  static todos: TodoItem[] = [];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const merge = (args["merge"] as boolean) ?? false;
    const tasks = (args["tasks"] as TodoItem[]) ?? [];

    if (tasks.length === 0) {
      return { success: false, output: "No tasks provided", truncated: false };
    }

    if (merge) {
      for (const t of tasks) {
        const existing = TodoWriteTool.todos.find((e) => e.id === t.id);
        if (existing) { Object.assign(existing, t); }
        else if (TodoWriteTool.todos.length < 50) { TodoWriteTool.todos.push(t); }
      }
    } else {
      TodoWriteTool.todos = tasks.slice(0, 50);
    }

    return { success: true, output: TodoWriteTool.formatTodos(), truncated: false };
  }

  static formatTodos(): string {
    if (TodoWriteTool.todos.length === 0) return "(no tasks)";
    return TodoWriteTool.todos
      .map((t) => {
        const icon = t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[*]" : t.status === "cancelled" ? "[-]" : "[ ]";
        return `${icon} ${t.subject} (${t.status})`;
      })
      .join("\n");
  }

  static reset(): void {
    TodoWriteTool.todos = [];
  }
}
