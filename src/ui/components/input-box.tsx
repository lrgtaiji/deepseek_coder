import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputBoxProps {
  onSubmit: (value: string) => void;
  isThinking: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({ onSubmit, isThinking }) => {
  const [value, setValue] = useState("");

  const handleSubmit = (val: string) => {
    if (!val.trim()) return;
    onSubmit(val);
    setValue("");
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">{"dscode > "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={isThinking ? "Thinking..." : "Ask anything..."}
        />
        {isThinking && <Text color="gray"> (Ctrl+C to abort)</Text>}
      </Box>
    </Box>
  );
};
