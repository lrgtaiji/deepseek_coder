import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";

// 子 Agent 任务定义
export interface SubAgentTask {
  id: string;
  instruction: string;
  context: {
    files?: string[];
    maxRounds: number;
  };
}

// 子 Agent 结果
export interface SubAgentResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  roundsUsed: number;
}

// 子 Agent 管理器 — 创建隔离的 Agent Loop 实例
export class SubAgentManager {
  constructor(
    private provider: LLMProvider,
    private settings: Settings,
    private tools: Map<string, BaseTool>
  ) {}

  // 启动子 Agent（异步执行）
  async run(task: SubAgentTask, signal?: AbortSignal): Promise<SubAgentResult> {
    try {
      const { agentLoop } = await import("../engine/agent-loop");

      // 构建带上下文限制的指令
      let instruction = task.instruction;
      if (task.context.files?.length) {
        instruction += `\n\n限定文件范围: ${task.context.files.join(", ")}`;
      }
      instruction += `\n\n任务完成后请总结结果。最大 ${task.context.maxRounds} 轮。`;

      let output = "";
      let rounds = 0;

      for await (const event of agentLoop(this.provider, this.settings, this.tools, instruction, signal)) {
        rounds++;

        if (event.type === "text") {
          output += event.content;
        }
        if (event.type === "error") {
          return {
            taskId: task.id,
            success: false,
            output,
            error: event.content,
            roundsUsed: rounds,
          };
        }
        if (event.type === "finish") {
          return {
            taskId: task.id,
            success: true,
            output: output || event.content,
            roundsUsed: rounds,
          };
        }
      }

      return {
        taskId: task.id,
        success: true,
        output,
        roundsUsed: rounds,
      };
    } catch (err) {
      return {
        taskId: task.id,
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        roundsUsed: 0,
      };
    }
  }
}
