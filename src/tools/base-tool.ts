// 工具定义 — OpenAI function calling 格式
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// 工具执行结果
export interface ToolResult {
  success: boolean;
  output: string;
  truncated: boolean;
}

// 工具抽象基类
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;
  abstract required: string[];
  abstract isReadOnly: boolean;
  abstract requiresApproval: boolean;

  toToolDef(): ToolDef {
    return {
      type: "function" as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: this.parameters,
          required: this.required,
        },
      },
    };
  }

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  // 截断大输出
  protected truncate(output: string, maxLen = 50000): { text: string; truncated: boolean } {
    if (output.length <= maxLen) return { text: output, truncated: false };
    return {
      text: output.slice(0, maxLen) + `\n...(truncated, ${output.length - maxLen} more chars)`,
      truncated: true,
    };
  }
}
