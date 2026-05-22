import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logger } from "../utils/logger";

export interface SessionEntry {
  id: string;
  created: string;
  updated: string;
  preview: string;
  messageCount: number;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

const BASE = join(homedir(), ".ds-code", "sessions");
const INDEX = join(BASE, "index.json");

function ensureDir(): void {
  if (!existsSync(BASE)) mkdirSync(BASE, { recursive: true });
}

function loadIndex(): SessionEntry[] {
  try { return JSON.parse(readFileSync(INDEX, "utf-8")); } catch { return []; }
}

function saveIndex(entries: SessionEntry[]): void {
  ensureDir();
  writeFileSync(INDEX, JSON.stringify(entries.slice(-50), null, 2), "utf-8");
}

function generateId(): string {
  const d = new Date().toISOString().split("T")[0]!.replace(/-/g, "");
  return d + "-" + Math.random().toString(36).slice(2, 8);
}

export function createSession(): string {
  const id = generateId();
  const entry: SessionEntry = { id, created: new Date().toISOString(), updated: new Date().toISOString(), preview: "(new session)", messageCount: 0 };
  const idx = loadIndex();
  idx.push(entry);
  saveIndex(idx);
  return id;
}

// 只追加 JSONL，不更新索引（索引延迟刷新）
export function saveMessage(sessionId: string, msg: SessionMessage): void {
  ensureDir();
  const path = join(BASE, sessionId + ".jsonl");
  const line = JSON.stringify(msg) + "\n";
  try { writeFileSync(path, line, { flag: "as" }); } catch (err) {
    logger.warn(`Session save failed, retrying: ${err instanceof Error ? err.message : String(err)}`);
    try { writeFileSync(path, line, { flag: "as", encoding: "utf-8" }); } catch (err2) { logger.error(`Session save permanently failed: ${err2 instanceof Error ? err2.message : String(err2)}`); }
  }
}

// 批量保存用户+助手消息，然后一次性刷新索引
export function saveExchange(sessionId: string, userMsg: SessionMessage, assistantMsg: SessionMessage): void {
  ensureDir();
  const path = join(BASE, sessionId + ".jsonl");
  const lines = JSON.stringify(userMsg) + "\n" + JSON.stringify(assistantMsg) + "\n";
  try { writeFileSync(path, lines, { flag: "as" }); } catch (err) {
    logger.warn(`Exchange save failed, retrying: ${err instanceof Error ? err.message : String(err)}`);
    try { writeFileSync(path, lines, { flag: "as", encoding: "utf-8" }); } catch (err2) { logger.error(`Exchange save permanently failed: ${err2 instanceof Error ? err2.message : String(err2)}`); }
  }

  // 递增更新索引，避免全量读取
  const idx = loadIndex();
  const entry = idx.find((e) => e.id === sessionId);
  if (entry) {
    entry.updated = new Date().toISOString();
    entry.preview = assistantMsg.content.slice(0, 80);
    entry.messageCount += 2;
  } else {
    idx.push({ id: sessionId, created: new Date().toISOString(), updated: new Date().toISOString(), preview: assistantMsg.content.slice(0, 80), messageCount: 2 });
  }
  saveIndex(idx);
}

export function loadSession(sessionId: string): SessionMessage[] {
  const path = join(BASE, sessionId + ".jsonl");
  try { return readFileSync(path, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function listSessions(limit = 20): SessionEntry[] {
  return loadIndex().reverse().slice(0, limit);
}

export function deleteSession(sessionId: string): void {
  const path = join(BASE, sessionId + ".jsonl");
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
  saveIndex(loadIndex().filter((e) => e.id !== sessionId));
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return loadIndex().find((e) => e.id === sessionId);
}
