import { BaseTool, ToolResult } from "./base-tool";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class WriteTool extends BaseTool {
  name = "Write";
  description = "创建或覆盖文件。会自动创建不存在的父目录。";
  isReadOnly = false;
  requiresApproval = true;

  parameters = {
    file_path: {
      type: "string",
      description: "要写入的文件的绝对路径",
    },
    content: {
      type: "string",
      description: "要写入的文件内容",
    },
  };

  required = ["file_path", "content"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args["file_path"] as string;
    const content = args["content"] as string;

    if (!filePath) {
      return { success: false, output: "Missing required parameter: file_path", truncated: false };
    }
    if (content === undefined || content === null) {
      return { success: false, output: "Missing required parameter: content", truncated: false };
    }

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const existed = existsSync(filePath);
      writeFileSync(filePath, content, "utf-8");

      const action = existed ? "Updated" : "Created";
      const lines = content.split("\n").length;
      const size = Buffer.byteLength(content, "utf-8");
      return {
        success: true,
        output: `${action} ${filePath} (${lines} lines, ${size} bytes)`,
        truncated: false,
      };
    } catch (err) {
      return {
        success: false,
        output: `Error writing ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }
}
