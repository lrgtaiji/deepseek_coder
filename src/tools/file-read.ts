import { BaseTool, ToolResult } from "./base-tool";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname } from "node:path";

export class ReadTool extends BaseTool {
  name = "Read";
  description = "读取文件内容。支持分页（offset/limit）和 PDF/图片文件。返回带行号的内容。";
  isReadOnly = true;
  requiresApproval = false;

  parameters = {
    file_path: {
      type: "string",
      description: "要读取的文件的绝对路径",
    },
    offset: {
      type: "integer",
      description: "起始行号（可选，从 1 开始）",
    },
    limit: {
      type: "integer",
      description: "读取行数（可选，默认 2000）",
    },
  };

  required = ["file_path"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args["file_path"] as string;
    const offset = (args["offset"] as number) ?? 1;
    const limit = (args["limit"] as number) ?? 2000;

    if (!filePath) {
      return { success: false, output: "Missing required parameter: file_path", truncated: false };
    }

    try {
      if (!existsSync(filePath)) {
        return { success: false, output: `File not found: ${filePath}`, truncated: false };
      }

      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return { success: false, output: `${filePath} is a directory, not a file`, truncated: false };
      }

      // 检查二进制/图片文件
      const ext = extname(filePath).toLowerCase();
      if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp"].includes(ext)) {
        return {
          success: true,
          output: `[Image file: ${filePath}] (${(stat.size / 1024).toFixed(1)} KB)`,
          truncated: false,
        };
      }
      if ([".pdf"].includes(ext)) {
        return {
          success: true,
          output: `[PDF file: ${filePath}] (${(stat.size / 1024).toFixed(1)} KB). Use pages parameter for PDF files.`,
          truncated: false,
        };
      }

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const startIdx = Math.max(0, offset - 1);
      const endIdx = Math.min(lines.length, startIdx + limit);
      const selectedLines = lines.slice(startIdx, endIdx);

      const numbered = selectedLines
        .map((line, i) => `${startIdx + i + 1}\t${line}`)
        .join("\n");

      const result = numbered || "(empty file)";
      const { text, truncated } = this.truncate(result);
      return { success: true, output: text, truncated };
    } catch (err) {
      return {
        success: false,
        output: `Error reading ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }
}
