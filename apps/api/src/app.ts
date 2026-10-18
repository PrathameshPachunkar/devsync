import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import type { AppContext } from "./context";
import { authenticate } from "./middleware/authenticate";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { originCheck } from "./middleware/origin-check";
import { authRouter } from "./modules/auth/auth.router";
import { boardsRouter } from "./modules/boards/boards.router";
import { webhookHandler } from "./modules/github/webhooks";

/** Builds the Express app from injected dependencies. Nothing here touches globals. */
export function createApp(ctx: AppContext): Express {
  const { config, logger } = ctx;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: config.webOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      maxAge: 600,
    }),
  );
  // Before express.json: the signature covers the exact raw bytes.
  app.post(
    "/v1/github/webhooks",
    express.raw({ type: "application/json", limit: "5mb" }),
    webhookHandler(ctx),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    await ctx.ping();
    res.json({ status: "ok" });
  });

  const v1 = express.Router();
  v1.use(originCheck(config.webOrigins));
  v1.use("/auth", authRouter(ctx));
  v1.use("/boards", authenticate(ctx.tokens), boardsRouter(ctx));
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
