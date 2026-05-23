import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
import { agentLoop } from "../engine/agent-loop";
import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  toolName?: string;
}

interface AppProps {
  provider: LLMProvider;
  settings: Settings;
  tools: Map<string, BaseTool>;
  initialPrompt?: string;
}

export const App: React.FC<AppProps> = ({ provider, settings, tools, initialPrompt }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [currentTool, setCurrentTool] = useState("");
  const [inputText, setInputText] = useState("");
  const [running, setRunning] = useState(false);

  const historyRef = useRef<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const msgId = useRef(0);
  const inputRef = useRef(inputText);
  inputRef.current = inputText;

  const addMsg = useCallback((role: string, content: string, toolName?: string) => {
    setMessages((prev) => [...prev, { id: msgId.current++, role: role as any, content, toolName }]);
  }, []);

  const runAgent = useCallback(async (userInput: string) => {
    if (!userInput.trim() || running) return;
    setRunning(true);
    setThinking(false);
    setThinkingText("");
    setCurrentTool("");
    addMsg("user", userInput);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let assistantOutput = "";

    try {
      for await (const ev of agentLoop(provider, settings, tools, userInput, ctrl.signal, undefined, undefined, historyRef.current)) {
        switch (ev.type) {
          case "thinking":
            setThinking(true);
            setThinkingText((prev) => prev + ev.content);
            break;
          case "text":
            setThinking(false);
            assistantOutput += ev.content;
            break;
          case "tool_start":
            setCurrentTool(ev.toolName || "tool");
            break;
          case "tool_result":
            setCurrentTool("");
            break;
          case "finish":
            break;
          case "error":
            setThinking(false);
            addMsg("system", "Error: " + ev.content);
            break;
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") addMsg("system", "Error: " + (e?.message || String(e)));
    }

    if (assistantOutput.trim()) {
      addMsg("assistant", assistantOutput.trim());
    }
    setRunning(false);
    setThinking(false);
    setCurrentTool("");
    abortRef.current = null;
  }, [provider, settings, tools, running, addMsg]);

  // 初始 prompt
  useEffect(() => {
    if (initialPrompt) runAgent(initialPrompt);
  }, []);

  // 快捷键
  useInput((input, key) => {
    if (key.escape) {
      if (running) { abortRef.current?.abort(); setRunning(false); }
      return;
    }
    if (input === "\x03") { exit(); return; }  // Ctrl+C

    if (running) return; // 处理中不响应输入

    if (key.return) {
      const text = inputRef.current.trim();
      if (text.startsWith("/exit") || text === "/quit") { exit(); return; }
      if (text === "/clear") { setMessages([]); setInputText(""); return; }
      if (text === "/help") {
        addMsg("system", "/status /diff /cost /memory /skills /config /compact /undo /resume /new /model /plan /clear /exit");
        return;
      }
      if (text) { runAgent(text); setInputText(""); }
      return;
    }

    if (key.backspace || key.delete) {
      setInputText((prev) => prev.slice(0, -1));
      return;
    }
    if (input && input.length === 1 && !key.ctrl) {
      setInputText((prev) => prev + input);
    }
  });

  const W = Math.min(process.stdout.columns || 80, 120);
  const sep = "─".repeat(W);

  const renderMsg = (msg: Message) => {
    if (msg.role === "user") {
      return (
        <Box key={msg.id} paddingLeft={3}>
          <Text bold color="#00bcd4">You: </Text>
          <Text color="#666">{msg.content}</Text>
        </Box>
      );
    }
    if (msg.role === "system") {
      return (
        <Box key={msg.id} paddingLeft={3}>
          <Text color="#666">{msg.content}</Text>
        </Box>
      );
    }
    return (
      <Box key={msg.id} flexDirection="column" paddingLeft={3}>
        <Text>{msg.content}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* 头部 */}
      <Box>
        <Text bold color="#00bcd4">DS Code</Text>
        <Text color="#666"> v1.0.0 | {settings.model}</Text>
        {running && <Text color="#ffeb3b"> ● thinking...</Text>}
      </Box>

      {/* 上线 */}
      <Text color="#005fd7">{sep}</Text>

      {/* 消息历史 */}
      <Static items={messages}>
        {(msg) => renderMsg(msg)}
      </Static>

      {/* 思考/工具指示器 */}
      {thinking && (
        <Box paddingLeft={3}>
          <Text color="#ffeb3b">thinking{thinkingText ? "..." : ""}</Text>
          {thinkingText && (
            <Text color="#666" dimColor>{" " + thinkingText.slice(-80)}</Text>
          )}
        </Box>
      )}
      {currentTool && (
        <Box paddingLeft={3}>
          <Text color="#666">[{currentTool}]</Text>
        </Box>
      )}

      {/* 输入框 + 下线 */}
      {!running && (
        <>
          <Box>
            <Text>dscode&gt; </Text>
            <Text>{inputText}</Text>
          </Box>
          <Text color="#005fd7">{sep}</Text>
        </>
      )}
    </Box>
  );
};
