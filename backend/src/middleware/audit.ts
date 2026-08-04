import type { Request } from "express";
import { requireContext } from "../lib/context.js";
import { AuditLog } from "../models/auditLog.model.js";

/**
 * Records an administrative change. Called explicitly from the handlers that
 * matter rather than wired into every write, so the log stays readable and the
 * GPS firehose never reaches it.
 *
 * Never throws: an audit failure must not roll back the action the user asked
 * for, but it does need to be visible in the logs.
 */
export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: unknown,
  before?: unknown,
  after?: unknown
): Promise<void> {
  try {
    const ctx = requireContext();
    await AuditLog.create({
      actorId: ctx.userId,
      actorRole: ctx.role,
      schoolId: ctx.schoolId,
      action,
      entity,
      entityId,
      before,
      after,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  } catch (err) {
    console.error("[audit] failed to record", action, err);
  }
}
