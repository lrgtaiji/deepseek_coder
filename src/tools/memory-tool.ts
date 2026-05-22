import { BaseTool, ToolResult } from "./base-tool";
import { MemoryStore } from "../context/memory";

export class MemoryTool extends BaseTool {
  name = "Memory";
  description = `保存重要信息到记忆系统，供未来对话使用。
在以下情况自动调用此工具：
- 用户明确要求"记住"某些信息
- 用户分享了偏好、习惯或工作流程
- 对话中出现了值得保留的项目背景或决策
- 用户对某些行为给出反馈（正面或负面）

记忆类型：
- user: 用户角色、偏好、知识背景
- feedback: 用户对工具行为的反馈（正面或负面）
- project: 项目上下文、架构决策、进度
- reference: 外部资源指针（文档链接、Slack频道等）`;

  isReadOnly = false;
  requiresApproval = false;

  parameters = {
    name: { type: "string", description: "简短标识符，如 user-prefs-python、project-architecture" },
    description: { type: "string", description: "一句话描述，用于索引" },
    type: { type: "string", enum: ["user", "feedback", "project", "reference"], description: "记忆类型" },
    content: { type: "string", description: "完整记忆内容（Markdown 格式，可包含 [[link]] 引用其他记忆）" },
    scope: { type: "string", enum: ["global", "project"], description: "全局记忆或项目记忆，默认 global" },
  };

  required = ["name", "type", "content"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const name = args["name"] as string;
    const description = (args["description"] as string) ?? "";
    const type = (args["type"] as "user" | "feedback" | "project" | "reference") ?? "project";
    const content = args["content"] as string;
    const scope = (args["scope"] as "global" | "project") ?? "global";

    if (!name || !content) {
      return { success: false, output: "Missing required parameters: name and content", truncated: false };
    }

    try {
      const store = new MemoryStore(scope);
      store.save({ name, description, type, content });
      return { success: true, output: `Memory saved: ${name} (${type}, ${scope})`, truncated: false };
    } catch (err) {
      return { success: false, output: `Memory save failed: ${err instanceof Error ? err.message : String(err)}`, truncated: false };
    }
  }
}
