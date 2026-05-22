import { BaseTool, ToolResult } from "./base-tool";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export class EditTool extends BaseTool {
  name = "Edit";
  description = `精确字符串替换编辑文件。
- old_string 必须在文件中唯一出现（或使用 replace_all 替换全部）
- 自动保持文件原有缩进格式
- new_string 必须与 old_string 不同`;

  isReadOnly = false;
  requiresApproval = true;

  parameters = {
    file_path: {
      type: "string",
      description: "要编辑的文件的绝对路径",
    },
    old_string: {
      type: "string",
      description: "要被替换的文本，必须在文件中唯一",
    },
    new_string: {
      type: "string",
      description: "替换后的新文本（必须与 old_string 不同）",
    },
    replace_all: {
      type: "boolean",
      description: "是否替换所有出现的 old_string（默认 false）",
    },
  };

  required = ["file_path", "old_string", "new_string"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args["file_path"] as string;
    const oldStr = args["old_string"] as string;
    const newStr = args["new_string"] as string;
    const replaceAll = (args["replace_all"] as boolean) ?? false;

    if (!filePath) {
      return { success: false, output: "Missing required parameter: file_path", truncated: false };
    }
    if (oldStr === newStr) {
      return { success: false, output: "old_string and new_string must be different", truncated: false };
    }

    try {
      if (!existsSync(filePath)) {
        return { success: false, output: `File not found: ${filePath}`, truncated: false };
      }

      const content = readFileSync(filePath, "utf-8");
      const count = this.countOccurrences(content, oldStr);

      if (count === 0) {
        return { success: false, output: `old_string not found in ${filePath}`, truncated: false };
      }

      if (count > 1 && !replaceAll) {
        return {
          success: false,
          output: `old_string found ${count} times in ${filePath}. Use replace_all: true to replace all, or provide more context to make it unique.`,
          truncated: false,
        };
      }

      const newContent = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr);
      writeFileSync(filePath, newContent, "utf-8");

      const replaced = replaceAll ? count : 1;
      return {
        success: true,
        output: `Edited ${filePath}: ${replaced} replacement(s)`,
        truncated: false,
      };
    } catch (err) {
      return {
        success: false,
        output: `Error editing ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }

  private countOccurrences(content: string, searchStr: string): number {
    if (!searchStr) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = content.indexOf(searchStr, pos)) !== -1) {
      count++;
      pos += searchStr.length;
    }
    return count;
  }
}
