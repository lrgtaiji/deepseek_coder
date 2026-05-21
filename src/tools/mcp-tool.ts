import { BaseTool, ToolResult, ToolDef } from "./base-tool";
import type { MCPClient } from "../mcp/mcp-client";

// 将 MCP 工具包装为 BaseTool
export class McpToolWrapper extends BaseTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  required: string[];
  isReadOnly = true;  // MCP 工具默认为只读
  requiresApproval = false;

  private td: ToolDef;
  private client: MCPClient;

  constructor(td: ToolDef, client: MCPClient) {
    super();
    this.td = td;
    this.client = client;
    this.name = td.function.name;
    this.description = td.function.description;
    this.parameters = td.function.parameters.properties ?? {};
    this.required = td.function.parameters.required ?? [];
  }

  toToolDef(): ToolDef {
    return this.td;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const output = await this.client.callTool(this.name, args);
      return { success: true, output, truncated: output.length > 5000 };
    } catch (err) {
      return {
        success: false,
        output: `MCP error: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }
}
