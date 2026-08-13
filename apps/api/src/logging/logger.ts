import type { FastifyServerOptions } from "fastify";
import type { ApiConfig } from "../config.js";

/** Redact anything that could leak a secret into logs — cookies, auth headers, password fields,
 * and full request bodies for the auth routes (which carry a plaintext password on the wire). */
export function buildLoggerOptions(cfg: ApiConfig): FastifyServerOptions["logger"] {
  return {
    level: cfg.nodeEnv === "test" ? "silent" : cfg.nodeEnv === "production" ? "info" : "debug",
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers['x-mcp-auth']",
        "req.body.password",
        "req.body.email",
        "res.headers['set-cookie']"
      ],
      censor: "[redacted]"
    },
    transport:
      cfg.nodeEnv === "development"
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
        : undefined
  };
}
