// REPL 引擎 — 处理所有 UI 渲染（思考动画、工具调用、流式输出、高亮）
// 独立于输入层，可被 readline 或 Ink 复用

export interface ReplRenderer {
  onStart(): void;
  onThinkingStart(): void;
  onThinkingTick(dots: number): void;
  onThinkingEnd(elapsed: number): void;
  onToolStart(name: string): void;
  onTextChunk(chunk: string, atLineStart: boolean): boolean; // returns new atLineStart
  onError(msg: string): void;
  onFinish(): void;
}

// ANSI 模式渲染器（readline 用）
export function createAnsiRenderer(M = "   "): ReplRenderer {
  const gray = "\x1b[90m";
  const reset = "\x1b[0m";
  const yellow = "\x1b[33m";
  const bold = "\x1b[1m";

  let thinkingTimer: ReturnType<typeof setInterval> | null = null;
  let thinkingDots = 0;

  // 流式高亮缓冲区
  let hlBuf = "";
  const cnt = (s: string, c: string): number => { let n = 0, i = -1; while ((i = s.indexOf(c, i + 1)) !== -1) n++; return n; };

  const highlight = (chunk: string): string => {
    hlBuf += chunk;
    let out = "";
    hlBuf = hlBuf.replace(/\*\*(.+?)\*\*/g, (_, t: string) => { out += yellow + bold + t + reset; return ""; });
    hlBuf = hlBuf.replace(/`([^`]+)`/g, (_, t: string) => { out += yellow + t + reset; return ""; });
    const si = hlBuf.lastIndexOf("**"), ti = hlBuf.lastIndexOf("`");
    if (si > -1 && cnt(hlBuf, "**") % 2 === 1) { out += hlBuf.slice(0, si); hlBuf = hlBuf.slice(si); }
    else if (ti > -1 && cnt(hlBuf, "`") % 2 === 1) { out += hlBuf.slice(0, ti); hlBuf = hlBuf.slice(ti); }
    else { out += hlBuf; hlBuf = ""; }
    return out;
  };

  return {
    onStart() { hlBuf = ""; },
    onThinkingStart() {
      thinkingDots = 0;
      thinkingTimer = setInterval(() => {
        thinkingDots = (thinkingDots + 1) % 4;
        process.stdout.write(reset + "\r" + M + gray + "thinking" + ".".repeat(thinkingDots + 1) + reset + "\x1b[K");
      }, 300);
    },
    onThinkingTick(_dots: number) {},
    onThinkingEnd(elapsed: number) {
      if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
      process.stdout.write(reset + "\r" + M + gray + "thinking (" + elapsed.toFixed(1) + "s)" + reset + "\x1b[K\n");
    },
    onToolStart(name: string) {
      if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
      process.stdout.write(reset + "\r" + M + gray + "[" + name + "]" + reset + "\x1b[K\n");
    },
    onTextChunk(chunk: string, atLineStart: boolean): boolean {
      let hl = highlight(chunk);
      if (atLineStart) { hl = reset + M + hl; atLineStart = false; }
      if (hl.endsWith("\n")) atLineStart = true;
      process.stdout.write(hl);
      return atLineStart;
    },
    onError(msg: string) {
      process.stdout.write("\n" + M + gray + "Error: " + msg + reset + "\n");
    },
    onFinish() {
      if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
      if (hlBuf) { process.stdout.write(reset + M + hlBuf); hlBuf = ""; }
    },
  };
}
