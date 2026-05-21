import { render } from "ink";
import { App } from "./app";
import type { LLMProvider } from "../providers/base-provider";
import type { Settings } from "../config/settings";
import type { BaseTool } from "../tools/base-tool";

export async function startInteractiveUI(
  provider: LLMProvider,
  settings: Settings,
  tools: Map<string, BaseTool>,
  initialPrompt?: string
): Promise<void> {
  try {
    const { unmount, waitUntilExit } = render(
      <App
        provider={provider}
        settings={settings}
        tools={tools}
        initialPrompt={initialPrompt || undefined}
      />
    );

    await waitUntilExit();
    unmount();
  } catch (err) {
    console.error("Failed to start interactive UI:", err instanceof Error ? err.message : String(err));
    console.log("Falling back to simple REPL...");
    throw err;
  }
}
