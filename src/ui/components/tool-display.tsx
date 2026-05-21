import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface ToolDisplayProps {
  isThinking: boolean;
  thinkingText: string;
  isExecuting: boolean;
  showThinking?: boolean;
}

export const ToolDisplay: React.FC<ToolDisplayProps> = ({
  isThinking,
  thinkingText,
  isExecuting,
  showThinking = true,
}) => {
  if (!isThinking && !isExecuting) return null;

  return (
    <Box flexDirection="column">
      {isThinking && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> thinking...</Text>
        </Box>
      )}
      {showThinking && thinkingText && (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>
            {thinkingText.slice(-120)}
          </Text>
        </Box>
      )}
      {isExecuting && (
        <Box>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> executing tool...</Text>
        </Box>
      )}
    </Box>
  );
};
