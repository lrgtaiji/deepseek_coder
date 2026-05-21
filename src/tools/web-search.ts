import { BaseTool, ToolResult } from "./base-tool";

export class WebSearchTool extends BaseTool {
  name = "WebSearch";
  description = "搜索网络，返回相关结果链接和摘要。用于获取最新信息或验证事实。";
  isReadOnly = true;
  requiresApproval = false;

  parameters = {
    query: {
      type: "string",
      description: "搜索查询词",
    },
  };

  required = ["query"];

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args["query"] as string;
    if (!query) {
      return { success: false, output: "Missing required parameter: query", truncated: false };
    }

    // 使用 DuckDuckGo 免费搜索 API（无需 key）
    try {
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "DS-Code/0.4.0",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          output: `Search failed: HTTP ${response.status}`,
          truncated: false,
        };
      }

      const html = await response.text();
      const results = this.parseDuckDuckGoResults(html);

      if (results.length === 0) {
        return { success: true, output: `No results for: ${query}`, truncated: false };
      }

      const output = results
        .slice(0, 10)
        .map((r) => `- [${r.title}](${r.url})\n  ${r.snippet}`)
        .join("\n");

      return { success: true, output: `Search: ${query}\n\n${output}`, truncated: false };
    } catch (err) {
      return {
        success: false,
        output: `Search error: ${err instanceof Error ? err.message : String(err)}`,
        truncated: false,
      };
    }
  }

  private parseDuckDuckGoResults(html: string): { title: string; url: string; snippet: string }[] {
    const results: { title: string; url: string; snippet: string }[] = [];

    // 解析 DuckDuckGo Lite 的 HTML
    const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<span[^>]*class="link-text"[^>]*>([^<]*)<\/span>/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1]?.startsWith("//") ? "https:" + match[1] : match[1];
      results.push({
        title: (match[3] || match[2] || "").trim(),
        url: url || "",
        snippet: "",
      });
    }

    // 备选：简单的文本解析
    if (results.length === 0) {
      const rows = html.match(/<tr class="result-snippet">[\s\S]*?<\/tr>/gi);
      if (rows) {
        for (const row of rows.slice(0, 10)) {
          const titleMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/);
          const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>([^<]+)/);
          if (titleMatch) {
            results.push({
              title: titleMatch[2] || "",
              url: titleMatch[1]?.startsWith("//") ? "https:" + titleMatch[1] : (titleMatch[1] || ""),
              snippet: snippetMatch?.[1]?.trim() || "",
            });
          }
        }
      }
    }

    return results;
  }
}
