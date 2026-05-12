type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, data?: unknown): void {
  // In produzione emetti JSON per Vercel logs
  if (process.env.NODE_ENV === "production") {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    };
    if (level === "error") {
      console.error(JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    if (level === "error") {
      console.error(prefix, message, data ?? "");
    } else if (level === "warn") {
      console.warn(prefix, message, data ?? "");
    } else {
      console.log(prefix, message, data ?? "");
    }
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log("info", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
};
