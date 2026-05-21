import { readFileSync } from "node:fs";

// 多模态输入类型
export type MultimodalContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

// 多模态消息构建器
export class MultimodalBuilder {
  // 从文件路径创建图片内容
  static fromFile(filePath: string, mimeType?: string): MultimodalContent {
    const type = mimeType ?? MultimodalBuilder.detectMimeType(filePath);
    const data = readFileSync(filePath);
    const base64 = data.toString("base64");
    return {
      type: "image_url",
      image_url: {
        url: `data:${type};base64,${base64}`,
        detail: "auto",
      },
    };
  }

  // 从 base64 字符串创建图片内容
  static fromBase64(base64: string, mimeType = "image/png"): MultimodalContent {
    return {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: "auto",
      },
    };
  }

  // 检测 MIME 类型
  static detectMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split(".").pop();
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      ico: "image/x-icon",
    };
    return mimeMap[ext ?? ""] ?? "image/png";
  }

  // 判断文件是否为支持的多模态类型
  static isSupportedImage(filePath: string): boolean {
    const ext = filePath.toLowerCase().split(".").pop() ?? "";
    return ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
  }

  // 构建多模态消息（文本 + 图片）
  static buildMultimodalMessage(
    text: string,
    images: MultimodalContent[]
  ): { role: "user"; content: MultimodalContent[] } {
    const content: MultimodalContent[] = [
      { type: "text", text },
      ...images,
    ];
    return { role: "user", content };
  }
}
