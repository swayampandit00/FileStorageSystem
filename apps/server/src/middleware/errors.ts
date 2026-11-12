import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { fail } from "../utils/http.js";
import { logger } from "../utils/logger.js";

export function notFound(_req: Request, res: Response) {
  return fail(res, "Not found", 404, "NOT_FOUND");
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return fail(res, err.issues[0]?.message ?? "Validation failed", 400, "VALIDATION");
  }
  const anyErr = err as { status?: number; message?: string; code?: string };
  if (typeof anyErr?.status === "number" && anyErr.status < 500) {
    return fail(res, anyErr.message ?? "Request failed", anyErr.status, anyErr.code);
  }
  logger.error("Unhandled error", { path: req.path, method: req.method });
  return fail(res, "Internal server error", 500, "INTERNAL");
}
