import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Zod schema — 所有配置项的类型安全定义
const ProviderSchema = z.object({
  name: z.string().default("deepseek"),
  baseUrl: z.string().default("https://api.deepseek.com"),
  apiKey: z.string().default(""),
});

const ThinkingSchema = z.object({
  enabled: z.boolean().default(true),
  reasoningEffort: z.enum(["max", "high", "medium", "min"]).default("max"),
});

const ToolsSchema = z.object({
  bashTimeout: z.number().default(120000),
  maxToolRounds: z.number().default(25),
  sandbox: z.enum(["off", "docker"]).default("off"),
});

const NotifySchema = z.object({
  system: z.boolean().default(true),
  webhook: z.string().default(""),
  script: z.string().default(""),
});

const SettingsSchema = z.object({
  model: z.string().default("deepseek-v4-pro"),
  provider: ProviderSchema.default({
    name: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
  }),
  thinking: ThinkingSchema.default({
    enabled: true,
    reasoningEffort: "max",
  }),
  tools: ToolsSchema.default({
    bashTimeout: 120000,
    maxToolRounds: 25,
    sandbox: "off",
  }),
  notify: NotifySchema.default({
    system: true,
    webhook: "",
    script: "",
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;
export interface NotifySettings { system?: boolean; webhook?: string; script?: string; }

// 解析环境变量中的占位符（如 $DEEPSEEK_API_KEY）
function resolveEnvVars(value: string): string {
  return value.replace(/\$(\w+)/g, (_, name) => process.env[name] ?? "");
}

// 按优先级加载配置：默认值 → 全局配置 → 项目配置 → 环境变量 → CLI 参数
export function loadSettings(cliOverrides?: Partial<Settings>): Settings {
  const defaults: Partial<Settings> = {
    model: "deepseek-v4-pro",
    provider: {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: process.env["DEEPSEEK_API_KEY"] ?? "",
    },
    thinking: { enabled: true, reasoningEffort: "max" },
    tools: { bashTimeout: 120000, maxToolRounds: 25, sandbox: "off" },
    notify: { system: true, webhook: "", script: "" },
  };

  // 1. 全局配置 (~/.ds-code/settings.json)
  const globalPath = join(homedir(), ".ds-code", "settings.json");
  let globalSettings: Partial<Settings> = {};
  if (existsSync(globalPath)) {
    try {
      globalSettings = JSON.parse(readFileSync(globalPath, "utf-8"));
    } catch {
      // 损坏的配置文件 → 忽略
    }
  }

  // 2. 项目配置 (./.ds-code/settings.json)
  const projectPath = join(process.cwd(), ".ds-code", "settings.json");
  let projectSettings: Partial<Settings> = {};
  if (existsSync(projectPath)) {
    try {
      projectSettings = JSON.parse(readFileSync(projectPath, "utf-8"));
    } catch {
      // 损坏的配置文件 → 忽略
    }
  }

  // 3. 合并（后面的覆盖前面的）
  const merged = {
    ...defaults,
    ...globalSettings,
    ...projectSettings,
    ...cliOverrides,
  };

  // 4. 解析环境变量占位符
  if (merged.provider?.apiKey) {
    merged.provider.apiKey = resolveEnvVars(merged.provider.apiKey);
  }

  // 5. Zod 校验 + 填充默认值
  return SettingsSchema.parse(merged);
}
