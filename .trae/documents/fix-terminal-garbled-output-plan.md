# 修复 PowerShell 终端字体突变和未知符号问题

## 问题现象

在 Windows PowerShell 中运行 `dscode -i`，一段时间后出现：
1. **字体突然变粗/变化** — 终端 ANSI 状态被破坏
2. **`m m m m` / `n n n n` 未知符号** — 出现在 text 和 tool 输出之间
3. **中文乱码** — "整无" 应为 "先"

## 根本原因

之前的修复方向（移除 cursorTo/clearLine/timer）虽然消除了光标操作破坏终端的可能性，但**问题根源在于模型或 BashTool 的输出中包含控制字符**，这些字符被直接写入终端后破坏了终端状态。

### 具体原因分析

1. **`stripEsc` 过滤不完整**：只过滤了 CSI（`\x1b[`）和 OSC 开头（`\x1b]`），但遗漏了：
   - `\x07` (BEL) — 响铃
   - `\x0e` (SO) / `\x0f` (SI) — **字符集切换**，PowerShell 收到后会切换字符集，导致后续所有字符显示异常（这就是"字体突变"的根因）
   - `\x1b(B`, `\x1b)B`, `\x1b*B`, `\x1b+B` — 字符集选择序列
   - `\x1b%G`, `\x1b%@` — UTF-8 切换序列
   - `\x1b#3`, `\x1b#4`, `\x1b#5`, `\x1b#6` — 双倍高度/宽度

2. **分隔线字符 `·` 的编码问题**：
   - `dash = "· ".repeat(...)` 中的 `·` 是 U+00B7（UTF-8: C2 B7）
   - 当 PowerShell 字符集被 `\x0e`/`\x0f` 切换后，UTF-8 编码的 `·` 会被错误解码，显示为一串拉丁字母（`m`/`n`）

3. **Windows stdout 编码不确定性**：
   - Bun/Node 在 Windows 上默认使用 UTF-8，但 PowerShell 的代码页可能不是 65001（UTF-8）
   - 需要显式设置 `process.stdout.setEncoding("utf8")` 确保一致性

## 修复方案

### 步骤 1：重写 `stripEsc` 函数，过滤所有控制字符

```typescript
// 过滤所有 ANSI 控制字符和终端破坏字符
const stripEsc = (s: string): string => {
  return s
    // CSI 序列: \x1b[N;...m 等
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    // OSC 序列: \x1b]...\x07 或 \x1b]...\x1b\\
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    // 字符集选择: \x1b(B \x1b)B \x1b*B \x1b+B
    .replace(/\x1b[()%*+][A-Za-z0-9]/g, "")
    // UTF-8 切换: \x1b%G \x1b%@
    .replace(/\x1b%[G@]/g, "")
    // 双倍高度/宽度: \x1b#3 \x1b#4 等
    .replace(/\x1b#[3456]/g, "")
    // 单个控制字符: BEL, SO, SI, VT, FF
    .replace(/[\x07\x0e\x0f\x0b\x0c]/g, "");
};
```

### 步骤 2：将分隔线 `·` 替换为 ASCII 安全字符

```typescript
// 之前: "· " — U+00B7，UTF-8 双字节，字符集切换后可能乱码
// 之后: "- " — ASCII 单字节，任何字符集下都安全
const dash = gray + M + "- ".repeat(Math.max(1, Math.floor((W - 3) / 2))).trimEnd() + reset;
```

### 步骤 3：在 CLI 启动时显式设置 UTF-8 编码

```typescript
// src/index.ts 顶部，在创建 readline 之前
if (process.platform === "win32") {
  process.stdout.setEncoding("utf8");
  process.stderr.setEncoding("utf8");
}
```

### 步骤 4：验证 `highlight` 函数不会引入未闭合的 ANSI

确保 `highlight` 输出的所有 ANSI 序列都是成对闭合的（`yellow + bold + ... + reset`），不会留下未闭合的终端状态。

### 步骤 5：运行类型检查和测试验证

```bash
bun run tsc --noEmit
bun test
```

## 预期效果

- **无字体突变**：`\x0e`/`\x0f` 等字符集切换字符被过滤，终端状态不会被破坏
- **无未知符号**：分隔线使用 ASCII `-` 替代 `·`，任何编码下都正常显示
- **中文正常**：UTF-8 编码显式设置 + 控制字符过滤，中文字符不会被截断或乱码

## 注意事项

- `dscode` 直接运行 `./src/index.ts`，Bun JIT 编译，**不需要 `bun run build`**
- `bun link` 后如果问题仍存在，可能是因为之前缓存了旧的 bun 链接，建议先 `bun unlink` 再 `bun link`
- 验证时建议先运行 `chcp 65001` 在 PowerShell 中手动设置 UTF-8 代码页，确认问题是否解决
