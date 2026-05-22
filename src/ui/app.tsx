import React, { useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { ChatView } from "./components/chat-view";
import { InputBox } from "./components/input-box";
import { ToolDisplay } from "./components/tool-display";
import { useChat } from "./hooks/use-chat";
import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";

interface AppProps {
  provider: LLMProvider;
  settings: Settings;
  tools: Map<string, BaseTool>;
  initialPrompt?: string;
}

export const App: React.FC<AppProps> = ({ provider, settings, tools, initialPrompt }) => {
  const { exit } = useApp();
  const { state, sendMessage, abort } = useChat(provider, settings, tools);

  // 处理初始 prompt
  useEffect(() => {
    if (initialPrompt) {
      sendMessage(initialPrompt);
    }
  }, []); // 仅首次运行

  // 快捷键处理
  useInput((input, key) => {
    if (key.escape) {
      abort();
    }
    if (input === "\x03") { // Ctrl+C
      exit();
    }
    if (input === "\x0c") { // Ctrl+L
      // 清屏 — handled by terminal
      process.stdout.write("\x1b[2J\x1b[H");
    }
  });

  const modelInfo = `${settings.model}${state.isThinking ? " [thinking]" : ""}`;

  return (
    <Box flexDirection="column" padding={1}>
      {/* 头部 */}
      <Box marginBottom={1}>
        <Text bold color="magenta">DS Code</Text>
        <Text color="gray"> v1.0.0 | {modelInfo}</Text>
      </Box>

      {/* 消息区域 */}
      <ChatView messages={state.messages} />

      {/* 思考/工具指示器 */}
      <ToolDisplay
        isThinking={state.isThinking}
        thinkingText={state.thinkingText}
        isExecuting={state.isExecuting}
      />

      {/* 输入区域 */}
      <InputBox
        onSubmit={!state.isThinking ? sendMessage : () => {}}
        isThinking={state.isThinking}
      />

      {/* 状态栏 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Enter: send | Esc: stop | Ctrl+C: exit | Ctrl+L: clear | /: commands
        </Text>
      </Box>
    </Box>
  );
};
