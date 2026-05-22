const DEBUG = process.env.DSCODE_DEBUG === "1";

export const logger = {
  debug: (msg: string, ...args: unknown[]) => {
    if (DEBUG) console.error(`[DEBUG] ${msg}`, ...args);
  },
  info: (msg: string, ...args: unknown[]) => {
    console.error(`[INFO] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.error(`[WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${msg}`, ...args);
  },
};
