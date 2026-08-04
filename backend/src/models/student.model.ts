import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

const studentSchema = new Schema(
  {
    ...tenantField(),
    name: { type: String, required: true, trim: true },
    class: { type: String, trim: true },
    section: { type: String, trim: true },
    rollNo: { type: String, trim: true },
    photoUrl: String,

    parentId: { type: Schema.Types.ObjectId, ref: "User", index: true },

    /** Transport assignment. A student without a bus never appears in the parent app. */
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", index: true },
    routeId: { type: Schema.Types.ObjectId, ref: "TransportRoute" },
    pickupStopId: Schema.Types.ObjectId,
    dropStopId: Schema.Types.ObjectId,

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

studentSchema.plugin(tenantPlugin);
studentSchema.index({ schoolId: 1, class: 1, section: 1 });
studentSchema.index({ schoolId: 1, name: "text" });
// Roll numbers are unique per school when present.
studentSchema.index(
  { schoolId: 1, rollNo: 1 },
  { unique: true, partialFilterExpression: { rollNo: { $type: "string" } } }
);

export const Student = model("Student", studentSchema);
