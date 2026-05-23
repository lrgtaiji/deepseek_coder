import { render } from "ink";
import { App } from "./app";
import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";
import type { AgentOptions } from "../engine/agent-loop";

export function startInteractiveUI(
  provider: LLMProvider,
  settings: Settings,
  tools: Map<string, BaseTool>,
  _agentOpts: AgentOptions,
  initialPrompt?: string
) {
  const instance = render(
    <App
      provider={provider}
      settings={settings}
      tools={tools}
      initialPrompt={initialPrompt || undefined}
    />
  );
  return instance;
}
