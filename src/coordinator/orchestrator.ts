import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";
import type { AgentEvent } from "../engine/agent-loop";
import { SubAgentManager } from "./sub-agent";
import type { SubAgentTask, SubAgentResult } from "./sub-agent";

// 协调器 — 管理多 Agent 协作编排
export class Orchestrator {
  private subAgentManager: SubAgentManager;

  constructor(
    _provider: LLMProvider,
    _settings: Settings,
    _tools: Map<string, BaseTool>
  ) {
    this.subAgentManager = new SubAgentManager(_provider, _settings, _tools);
  }

  // 并行执行多个子 Agent 任务
  async runParallel(
    tasks: SubAgentTask[],
    signal?: AbortSignal
  ): Promise<SubAgentResult[]> {
    if (tasks.length === 0) return [];

    const results = await Promise.all(
      tasks.map((task) => this.subAgentManager.run(task, signal))
    );

    return results;
  }

  // 检测和标记冲突（多个 Agent 修改了同一文件的不同部分）
  detectConflicts(results: SubAgentResult[]): string[] {
    const conflicts: string[] = [];

    for (const result of results) {
      if (!result.success) {
        conflicts.push(`Task ${result.taskId} failed: ${result.error ?? "unknown error"}`);
      }
    }

    return conflicts;
  }

  // 将子 Agent 结果合并为统一摘要
  mergeResults(results: SubAgentResult[]): string {
    if (results.length === 0) return "No results.";

    const parts = results.map((r) => {
      const status = r.success ? "OK" : "FAIL";
      return `### Task: ${r.taskId} [${status}] (${r.roundsUsed} rounds)\n${r.output}`;
    });

    const conflicts = this.detectConflicts(results);
    if (conflicts.length > 0) {
      parts.push("### Conflicts Detected");
      parts.push(...conflicts.map((c) => `- ${c}`));
    }

    return parts.join("\n\n");
  }

  // 自动分解任务 — 使用 LLM 将复合任务拆分为子任务
  async *decomposeAndExecute(
    userMessage: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentEvent> {
    // 先用主 Agent 分析任务
    yield {
      type: "text",
      content: "Analyzing task for parallel execution...",
      toolName: "",
    };

    // 默认策略：不自动分解，由主 Agent 的 AgentTool 触发
    // 这里提供一个简单的关键词拆分
    const parallelMarkers = ["parallel", "同时", "分别", "separately", "concurrently"];
    const shouldDecompose = parallelMarkers.some((m) =>
      userMessage.toLowerCase().includes(m)
    );

    if (!shouldDecompose) {
      yield {
        type: "text",
        content: "Task will be handled by main agent.",
        toolName: "",
      };
      return;
    }

    // 简单拆分：按句号/分号分割
    const subtasks = userMessage
      .split(/[;；。]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    if (subtasks.length <= 1) {
      yield {
        type: "text",
        content: "Could not decompose into parallel tasks. Use /parallel for manual dispatch.",
        toolName: "",
      };
      return;
    }

    const tasks: SubAgentTask[] = subtasks.map((instruction, i) => ({
      id: `subtask-${i + 1}`,
      instruction,
      context: { maxRounds: 10 },
    }));

    yield {
      type: "text",
      content: `Decomposed into ${tasks.length} parallel tasks. Executing...`,
      toolName: "",
    };

    const results = await this.runParallel(tasks, signal);
    const merged = this.mergeResults(results);

    yield { type: "text", content: merged, toolName: "" };
  }
}
