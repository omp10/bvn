import { Schema, model } from "mongoose";
import { tenantField, tenantPlugin } from "./plugins/tenant.js";

/**
 * Trip breadcrumb history, used only for route replay and dispute resolution.
 * Live tracking reads Trip.lastPosition, never this collection.
 *
 * Volume is modest: buses run ~3 hours a day and the app reports every 10s, so
 * a 100-bus school writes ~100k documents a day. The TTL keeps 90 days and
 * drops the rest — the trip summary lives on the Trip document forever.
 */
const positionSchema = new Schema(
  {
    ...tenantField(),
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    speedKmph: Number,
    heading: Number,
    accuracy: Number,
    /** Device clock at capture — may be well behind receivedAt after a dead zone. */
    at: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

positionSchema.plugin(tenantPlugin);
positionSchema.index({ tripId: 1, at: 1 });
positionSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

// A buffered driver app re-uploading after a dead zone must not duplicate points.
positionSchema.index({ tripId: 1, at: 1, lat: 1, lng: 1 }, { unique: true });

export const Position = model("Position", positionSchema);
