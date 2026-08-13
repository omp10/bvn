import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { badRequest, forbidden, handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { publicUrl, removeUpload, upload, UPLOAD_KINDS, type UploadKind } from "../../lib/uploads.js";
import { audit } from "../../middleware/audit.js";
import { School } from "../../models/school.model.js";
import { Student } from "../../models/student.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { DOCUMENT_TYPES } from "../../models/vehicle.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

export const uploadRouter = Router();
uploadRouter.use(authenticate);

/**
 * Generic upload. Returns a URL that the caller then saves onto whatever record
 * it belongs to — the two steps stay separate so a half-filled form does not
 * leave an orphaned record, only an orphaned file.
 */
uploadRouter.post(
  "/:kind",
  validate({ params: z.object({ kind: z.enum(UPLOAD_KINDS) }) }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent — the field must be called 'file'");
    const kind = req.params.kind as UploadKind;
    res.status(201).json({
      url: publicUrl(kind, req.file.filename),
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  })
);

/* ── Attach an upload to a record ────────────────────────────────────
   Each of these replaces the previous file and deletes it, so the folder does
   not silently fill with superseded logos. */

/** School logo — super admin only, since branding is a platform-level action. */
uploadRouter.post(
  "/school/:id/logo",
  requireRole("super_admin"),
  validate({ params: idParam }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent");
    const school = await School.findById(req.params.id);
    if (!school) throw notFound("school not found");

    const branding = school.branding as { logoUrl?: string } | undefined;
    const previous = branding?.logoUrl;

    const url = publicUrl("logos", req.file.filename);
    if (branding) branding.logoUrl = url;
    school.markModified("branding");
    await school.save();

    // Only after the new one is safely saved — a failed save must not leave the
    // school with neither logo.
    await removeUpload(previous);
    await audit(req, "school.logo", "School", school._id);
    res.status(201).json({ url });
  })
);

/** Photo for a driver, attendant or parent in this school. */
uploadRouter.post(
  "/user/:id/photo",
  requireRole("school_admin"),
  validate({ params: idParam }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent");
    const person = await User.findOne({ _id: req.params.id });
    if (!person) throw notFound("not found");

    const previous = person.photoUrl;
    person.photoUrl = publicUrl("photos", req.file.filename);
    await person.save();

    await removeUpload(previous);
    res.status(201).json({ url: person.photoUrl });
  })
);

uploadRouter.post(
  "/student/:id/photo",
  requireRole("school_admin"),
  validate({ params: idParam }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent");
    const student = await Student.findOne({ _id: req.params.id });
    if (!student) throw notFound("student not found");

    const previous = student.photoUrl;
    student.photoUrl = publicUrl("photos", req.file.filename);
    await student.save();

    await removeUpload(previous);
    res.status(201).json({ url: student.photoUrl });
  })
);

uploadRouter.post(
  "/vehicle/:id/photo",
  /* Both roles by design: the office manages the fleet, but the person
     standing next to the bus with a camera is the driver. The role check
     alone is not enough for a driver — they may only photograph their own
     bus, which is the ownership check below. */
  requireRole("school_admin", "driver"),
  validate({ params: idParam }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent");
    const ctx = requireContext();
    const vehicle = await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("vehicle not found");
    if (ctx.role === "driver" && String(vehicle.driverId) !== String(ctx.userId)) {
      throw forbidden("you can only photograph your own bus");
    }

    const previous = vehicle.photoUrl;
    vehicle.photoUrl = publicUrl("photos", req.file.filename);
    await vehicle.save();

    await removeUpload(previous);
    res.status(201).json({ url: vehicle.photoUrl });
  })
);

/**
 * A vehicle document — RC, insurance, fitness, pollution, permit.
 * School admins act within their tenant; owners must own the vehicle.
 */
uploadRouter.post(
  "/vehicle/:id/document",
  requireRole("school_admin", "owner"),
  validate({
    params: idParam,
    query: z.object({
      type: z.enum(DOCUMENT_TYPES),
      number: z.string().trim().optional(),
      expiresOn: z.coerce.date().optional(),
    }),
  }),
  upload.single("file"),
  handler(async (req, res) => {
    if (!req.file) throw badRequest("no file was sent");
    const ctx = requireContext();
    const q = req.query as never as { type: string; number?: string; expiresOn?: Date };

    // An owner spans schools, so their lookup is the explicit cross-school read
    // narrowed by ownerId; a school admin stays inside the tenant scope.
    const vehicle =
      ctx.role === "owner"
        ? await allSchools(Vehicle.findOne({ _id: req.params.id, ownerId: ctx.userId }))
        : await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("vehicle not found");

    vehicle.documents.push({
      type: q.type,
      number: q.number,
      expiresOn: q.expiresOn,
      url: publicUrl("documents", req.file.filename),
    } as never);
    await vehicle.save();

    await audit(req, "vehicle.document", "Vehicle", vehicle._id, undefined, { type: q.type });
    res.status(201).json(vehicle.documents);
  })
);

uploadRouter.post(
  "/vehicle/:id/photos",
  requireRole("school_admin", "owner"),
  validate({ params: idParam }),
  upload.array("file", 5),
  handler(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) throw badRequest("no files were sent");
    const ctx = requireContext();

    const vehicle =
      ctx.role === "owner"
        ? await allSchools(Vehicle.findOne({ _id: req.params.id, ownerId: ctx.userId }))
        : await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("vehicle not found");

    vehicle.photos.push(...files.map((f) => publicUrl("photos", f.filename)));
    await vehicle.save();
    res.status(201).json({ photos: vehicle.photos });
  })
);

uploadRouter.delete(
  "/vehicle/:id/document/:documentId",
  requireRole("school_admin", "owner"),
  validate({ params: z.object({ id: objectId, documentId: objectId }) }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const vehicle =
      ctx.role === "owner"
        ? await allSchools(Vehicle.findOne({ _id: req.params.id, ownerId: ctx.userId }))
        : await Vehicle.findOne({ _id: req.params.id });
    if (!vehicle) throw notFound("vehicle not found");

    const document = vehicle.documents.find((d) => String(d._id) === req.params.documentId);
    if (!document) throw notFound("document not found");

    await removeUpload(document.url);
    vehicle.documents.pull({ _id: req.params.documentId });
    await vehicle.save();

    await audit(req, "vehicle.documentRemoved", "Vehicle", vehicle._id);
    res.json({ ok: true });
  })
);
