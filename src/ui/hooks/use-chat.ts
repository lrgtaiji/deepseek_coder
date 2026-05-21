import { useState, useCallback, useRef } from "react";
import type { BaseTool, ToolResult } from "../../tools/base-tool";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  toolResult?: ToolResult;
  timestamp: Date;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  isExecuting: boolean;
  thinkingText: string;
}

export function useChat(
  provider: any,
  settings: any,
  tools: Map<string, BaseTool>
) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isThinking: false,
    isExecuting: false,
    thinkingText: "",
  });

  const abortRef = useRef<AbortController | null>(null);
  let nextId = useRef(0);

  const addMessage = useCallback((role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>) => {
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, {
        id: nextId.current++,
        role,
        content,
        timestamp: new Date(),
        ...extra,
      }],
    }));
  }, []);

  const sendMessage = useCallback(async (userInput: string) => {
    if (!userInput.trim()) return;

    const controller = new AbortController();
    abortRef.current = controller;

    addMessage("user", userInput);

    setState((prev) => ({ ...prev, isThinking: true, thinkingText: "" }));

    try {
      const { agentLoop } = await import("../../engine/agent-loop");

      for await (const event of agentLoop(provider, settings, tools, userInput, controller.signal)) {
        switch (event.type) {
          case "thinking":
            setState((prev) => ({
              ...prev,
              thinkingText: prev.thinkingText + event.content,
            }));
            break;

          case "text":
            setState((prev) => ({ ...prev, isThinking: false }));
            addMessage("assistant", event.content);
            break;

          case "tool_start":
            setState((prev) => ({ ...prev, isExecuting: true }));
            break;

          case "tool_result":
            setState((prev) => ({ ...prev, isExecuting: false }));
            addMessage("tool", event.content.slice(0, 300), {
              toolName: event.toolName,
              toolResult: event.toolResult,
            });
            break;

          case "error":
            setState((prev) => ({ ...prev, isThinking: false, isExecuting: false }));
            addMessage("system", `Error: ${event.content}`);
            break;
        }
      }
    } catch (err) {
      setState((prev) => ({ ...prev, isThinking: false }));
      addMessage("system", `Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [provider, settings, tools, addMessage]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isThinking: false, isExecuting: false }));
  }, []);

  return { state, sendMessage, abort };
}
