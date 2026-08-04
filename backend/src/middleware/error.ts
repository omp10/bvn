import type { ErrorRequestHandler, RequestHandler } from "express";
import { Error as MongooseError } from "mongoose";
import { env } from "../config/env.js";
import multer from "multer";
import { AppError, isDuplicateKey } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.path}`, code: "not_found" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "that file is larger than 5 MB"
      : err.code === "LIMIT_FILE_COUNT" ? "too many files at once"
      : "upload failed: " + err.code;
    return res.status(400).json({ error: message, code: "bad_request" });
  }

  if (err instanceof MongooseError.CastError) {
    return res.status(400).json({ error: `invalid ${err.path}`, code: "bad_request" });
  }

  if (err instanceof MongooseError.ValidationError) {
    return res.status(400).json({
      error: "validation failed",
      code: "bad_request",
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  }

  if (isDuplicateKey(err)) {
    // Reaching here means a handler did not treat the collision as expected —
    // it is a conflict for the client, and a missing catch for us.
    return res.status(409).json({ error: "already exists", code: "conflict" });
  }

  // Anything else is our bug. A thrown "tenant scope missing" lands here, and
  // the client gets nothing useful out of it.
  console.error("[unhandled]", err);
  res.status(500).json({
    error: "internal server error",
    code: "internal",
    ...(env.isProd ? {} : { message: (err as Error)?.message, stack: (err as Error)?.stack }),
  });
};
