// ANSI escape codes — 统一颜色管理
export const reset = "\x1b[0m";
export const bold = "\x1b[1m";
export const dim = "\x1b[2m";
export const gray = "\x1b[90m";
export const red = "\x1b[31m";
export const green = "\x1b[32m";
export const yellow = "\x1b[33m";
export const blue = "\x1b[38;5;39m";
export const cyan = "\x1b[36m";
export const magenta = "\x1b[35m";

export function keyword(text: string): string { return yellow + bold + text + reset; }
export function subtle(text: string): string { return gray + text + reset; }
export function error(text: string): string { return red + text + reset; }
export function highlight(text: string): string { return cyan + bold + text + reset; }
