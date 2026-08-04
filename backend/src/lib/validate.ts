import type { RequestHandler } from "express";
import { z, ZodError, type ZodTypeAny } from "zod";
import { badRequest } from "./errors.js";

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/**
 * Validates and replaces req.body/query/params with the parsed result, so
 * handlers work with typed, trimmed data and never see raw client input.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query ?? {}));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params ?? {}));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
        return next(badRequest("validation failed", details));
      }
      next(err);
    }
  };

/* Shared field shapes — one definition of what a valid phone or id looks like. */
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "invalid id");
export const phone = z.string().trim().regex(/^[6-9]\d{9}$/, "enter a valid 10-digit mobile number");
export const password = z.string().min(6, "password must be at least 6 characters");
export const schoolCode = z.string().trim().toUpperCase().length(6, "school code is 6 characters");
export const idParam = z.object({ id: objectId });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export { z };
