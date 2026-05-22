import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../hooks/use-chat";

interface ChatViewProps {
  messages: ChatMessage[];
  maxVisible?: number;
}

export const ChatView: React.FC<ChatViewProps> = ({ messages, maxVisible = 20 }) => {
  const visibleMessages = messages.slice(-maxVisible);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {messages.length === 0 && (
        <Box>
          <Text color="gray">DS Code v1.0.0 — Type /help for commands, Esc to stop</Text>
        </Box>
      )}

      {visibleMessages.map((msg) => (
        <MessageRow key={msg.id} message={msg} />
      ))}
    </Box>
  );
};

const MessageRow: React.FC<{ message: ChatMessage }> = ({ message }) => {
  switch (message.role) {
    case "user":
      return (
        <Box>
          <Text color="cyan">{"You > "}</Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box flexDirection="column" marginY={1}>
          <Text>{message.content}</Text>
        </Box>
      );

    case "tool":
      return (
        <Box>
          <Text color="blue">[{message.toolName || "tool"}]</Text>
          <Text color="gray"> {message.content.slice(0, 200)}</Text>
        </Box>
      );

    case "system":
      return (
        <Box>
          <Text color="red">{message.content}</Text>
        </Box>
      );

    default:
      return null;
  }
};
