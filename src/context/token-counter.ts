// 简易 Token 计数器
// 使用字符级估算: 中文 ~1 token/字, 英文 ~1 token/3.5 字符
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (const char of text) {
    if (/[一-鿿㐀-䶿]/.test(char)) {
      tokens += 1.2; // 中文字符约 1.2 token
    } else if (/\s/.test(char)) {
      tokens += 0.25; // 空格/换行
    } else {
      tokens += 0.3; // 英文字符约 0.3 token
    }
  }
  return Math.ceil(tokens);
}

// 计算消息列表的总 token 估算
export function estimateMessageTokens(
  messages: { role: string; content: string | null }[]
): number {
  let total = 0;
  for (const msg of messages) {
    // 每条消息的 overhead
    total += 4;
    if (msg.content) {
      total += estimateTokens(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
  }
  return total;
}

// 上下文预算管理器
export class TokenBudget {
  private maxTokens: number;
  private usedTokens = 0;

  constructor(maxTokens = 128000) {
    this.maxTokens = maxTokens;
  }

  get max(): number { return this.maxTokens; }
  get used(): number { return this.usedTokens; }
  get remaining(): number { return Math.max(0, this.maxTokens - this.usedTokens); }
  get usageRatio(): number { return this.usedTokens / this.maxTokens; }

  add(text: string): void {
    this.usedTokens += estimateTokens(text);
  }

  addMessages(messages: { role: string; content: string | null }[]): void {
    this.usedTokens += estimateMessageTokens(messages);
  }

  reset(): void {
    this.usedTokens = 0;
  }

  // 是否超过阈值
  isAboveThreshold(ratio: number): boolean {
    return this.usageRatio >= ratio;
  }
}
