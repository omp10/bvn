import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An error we chose to return. Anything else is a bug and becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
    readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError(400, m, "bad_request", details);
export const unauthorized = (m = "unauthorized") => new AppError(401, m, "unauthorized");
export const forbidden = (m = "forbidden") => new AppError(403, m, "forbidden");
export const notFound = (m = "not found") => new AppError(404, m, "not_found");
export const conflict = (m: string) => new AppError(409, m, "conflict");

/** Wraps async handlers so a rejected promise reaches the error middleware. */
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const isDuplicateKey = (e: unknown): boolean =>
  !!e && typeof e === "object" && (e as { code?: number }).code === 11000;
