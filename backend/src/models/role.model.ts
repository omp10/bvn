import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";
import { ALL_PERMISSIONS } from "../lib/permissions.js";

/**
 * A named permission set inside one school (FRD 27).
 *
 * Custom roles sit *under* school_admin rather than beside the six built-in
 * roles: a "Transport Coordinator" is still a school_admin as far as routing and
 * tenant scoping are concerned, just one whose permission list is narrower. That
 * keeps authentication, the URL spaces and the tenant plugin unchanged, and
 * confines the new concept to authorisation.
 */
const roleSchema = new Schema(
  {
    ...tenantField(),
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (list: string[]) => list.every((p) => ALL_PERMISSIONS.includes(p)),
        message: "unknown permission",
      },
    },
    /** Locks the built-in "School Administrator" role from being edited away. */
    system: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

roleSchema.plugin(tenantPlugin);
roleSchema.index({ schoolId: 1, name: 1 }, { unique: true });

export const Role = model("Role", roleSchema);
