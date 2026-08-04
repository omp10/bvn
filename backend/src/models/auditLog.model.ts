import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

/**
 * Who changed what, when. Written for administrative actions only — not for
 * every read, and not for the GPS firehose.
 */
const auditLogSchema = new Schema(
  {
    // required:false — super admin actions on schools have no tenant.
    ...tenantField(false),
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true }, // "school.suspend", "student.update"
    entity: { type: String, required: true }, // model name
    entityId: Schema.Types.ObjectId,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.plugin(tenantPlugin);
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

export const AuditLog = model("AuditLog", auditLogSchema);
