import { pino, type Logger } from "pino";

import type { AppConfig } from "../config";

export type { Logger };

export function createLogger(config: Pick<AppConfig, "env" | "logLevel">): Logger {
  return pino({
    level: config.env === "test" ? "silent" : config.logLevel,
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
      censor: "[redacted]",
    },
    ...(config.env === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
