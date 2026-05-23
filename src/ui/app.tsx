import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
import { agentLoop } from "../engine/agent-loop";
import { InputBox } from "./components/input-box";
import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
}

interface AppProps {
  provider: LLMProvider;
  settings: Settings;
  tools: Map<string, BaseTool>;
  initialPrompt?: string;
}

// 把 **粗体** 和 `代码` 拆成带样式的片段
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Text>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <Text key={i} bold color="#ffeb3b">{p.slice(2, -2)}</Text>;
        if (p.startsWith("`") && p.endsWith("`"))
          return <Text key={i} color="#ffeb3b">{p.slice(1, -1)}</Text>;
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

export const App: React.FC<AppProps> = ({ provider, settings, tools, initialPrompt }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [currentTool, setCurrentTool] = useState("");
  const [running, setRunning] = useState(false);

  const historyRef = useRef<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const msgId = useRef(0);

  const addMsg = useCallback((role: string, content: string) => {
    setMessages((prev) => [...prev, { id: msgId.current++, role: role as any, content }]);
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
            setThinkingText((prev) => (prev + ev.content).slice(-200));
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
          case "error":
            setThinking(false);
            addMsg("system", "Error: " + ev.content);
            break;
        }
      }
    } catch (e: unknown) {
      const err = e as Error;
      if (err?.name !== "AbortError") addMsg("system", "Error: " + (err?.message || String(e)));
    }

    if (assistantOutput.trim()) addMsg("assistant", assistantOutput.trim());
    setRunning(false);
    setThinking(false);
    setCurrentTool("");
    abortRef.current = null;
  }, [provider, settings, tools, running, addMsg]);

  useEffect(() => {
    if (initialPrompt) runAgent(initialPrompt);
  }, []);

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === "/exit" || trimmed === "/quit") { exit(); return; }
    if (trimmed === "/clear") { setMessages([]); return; }
    if (trimmed === "/help") { addMsg("system", "/status /diff /cost /memory /skills /config /compact /undo /resume /new /model /plan /clear /exit"); return; }
    if (trimmed) { runAgent(trimmed); }
  };

  useInput((_input, key) => {
    if (key.escape) {
      if (running) { abortRef.current?.abort(); setRunning(false); }
    }
    if (key.ctrl && _input === "c") { exit(); }
  });

  const W = Math.min(process.stdout.columns || 80, 120);
  const sep = "─".repeat(W);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box>
        <Text bold color="#00bcd4">DS Code</Text>
        <Text color="#666"> v1.0.0 | {settings.model}</Text>
        {running && <Text color="#ffeb3b"> ● thinking...</Text>}
      </Box>
      <Text color="#005fd7">{sep}</Text>

      <Static items={messages}>
        {(msg) =>
          msg.role === "user" ? (
            <Box key={msg.id} paddingLeft={3}>
              <Text bold color="#00bcd4">You: </Text>
              <Text color="#666">{msg.content}</Text>
            </Box>
          ) : msg.role === "system" ? (
            <Box key={msg.id} paddingLeft={3}>
              <Text color="#666">{msg.content}</Text>
            </Box>
          ) : (
            <Box key={msg.id} flexDirection="column" paddingLeft={3}>
              <RichText text={msg.content} />
            </Box>
          )
        }
      </Static>

      {thinking && (
        <Box paddingLeft={3}>
          <Text color="#ffeb3b">thinking...</Text>
          {thinkingText ? <Text color="#666" dimColor>{" " + thinkingText.slice(-60)}</Text> : null}
        </Box>
      )}
      {currentTool ? (
        <Box paddingLeft={3}>
          <Text color="#666">[{currentTool}]</Text>
        </Box>
      ) : null}

      <InputBox onSubmit={handleSubmit} disabled={running} />
      <Text color="#005fd7">{sep}</Text>
      <Box paddingLeft={3}>
        <Text color="#666">/help  /status  /skills  /memory  /new</Text>
      </Box>
    </Box>
  );
};
