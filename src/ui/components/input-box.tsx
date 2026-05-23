import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputBoxProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    onSubmit(text);
    setValue("");
  };

  if (disabled) return null;

  return (
    <Box>
      <Text>dscode&gt; </Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
};
