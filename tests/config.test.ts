import { describe, it, expect } from "bun:test";

describe("Settings", () => {
  it("should load default settings", async () => {
    const { loadSettings } = await import("../src/config/settings");
    const settings = loadSettings();
    expect(settings.model).toBe("deepseek-v4-pro");
    expect(settings.thinking.enabled).toBe(true);
    expect(settings.thinking.reasoningEffort).toBe("max");
    expect(settings.tools.maxToolRounds).toBe(25);
    expect(settings.tools.bashTimeout).toBe(120000);
    expect(settings.provider.name).toBe("deepseek");
    expect(settings.provider.baseUrl).toBe("https://api.deepseek.com");
  });

  it("should apply CLI overrides", async () => {
    const { loadSettings } = await import("../src/config/settings");
    const settings = loadSettings({
      model: "deepseek-v4-flash",
      thinking: { enabled: false, reasoningEffort: "min" },
    });
    expect(settings.model).toBe("deepseek-v4-flash");
    expect(settings.thinking.enabled).toBe(false);
    expect(settings.thinking.reasoningEffort).toBe("min");
  });

  it("should handle partial overrides", async () => {
    const { loadSettings } = await import("../src/config/settings");
    const settings = loadSettings({ model: "custom-model" });
    expect(settings.model).toBe("custom-model");
    // 其他值保持默认
    expect(settings.thinking.enabled).toBe(true);
  });
});

describe("BaseTool", () => {
  it("should generate OpenAI tool definition", async () => {
    const { ReadTool } = await import("../src/tools/file-read");
    const tool = new ReadTool();
    const def = tool.toToolDef();

    expect(def.type).toBe("function");
    expect(def.function.name).toBe("Read");
    expect(def.function.parameters.type).toBe("object");
    expect(def.function.parameters.required).toContain("file_path");
  });
});
