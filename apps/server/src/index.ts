import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { bootstrapAdmin, migrate } from "./db.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { filesRouter, foldersRouter, storageRouter } from "./routes/files.js";
import { googleRouter } from "./routes/google.js";
import { sharesRouter } from "./routes/shares.js";
import { logger } from "./utils/logger.js";

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);

const allowExact = new Set([config.webOrigin, ...config.corsOrigins]);

function isDevLocalOrigin(origin: string): boolean {
  if (config.nodeEnv === "production") return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "10.0.2.2" ||
      hostname.endsWith(".monkeycode-ai.live") ||
      hostname.endsWith(".local") ||
      /^(10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(hostname)
    );
  } catch {
    return false;
  }
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowExact.has(origin) || isDevLocalOrigin(origin)) return cb(null, origin);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/google", googleRouter);
app.use("/api/files", filesRouter);
app.use("/api/folders", foldersRouter);
app.use("/api/storage", storageRouter);
app.use("/api", sharesRouter);
app.use("/api/admin", adminRouter);

app.use(notFound);
app.use(errorHandler);

await migrate();
await bootstrapAdmin();

app.listen(config.port, config.host, () => {
  logger.info("MyCloud API listening", { host: config.host, port: config.port });
});
