import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import multer, { type FileFilterCallback } from "multer";
import type { Request } from "express";
import { badRequest } from "./errors.js";
import { currentSchoolId } from "./context.js";

/**
 * Files live on this server's disk under `uploads/`, not in an object store.
 *
 * One consequence worth knowing: the folder is per-machine state. Running two
 * API instances behind a load balancer means an image uploaded to instance A is
 * a 404 on instance B — put the folder on a shared volume (or move to S3) before
 * scaling out. `uploads/` must also survive deploys; it is not in the image.
 */
export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

/** Categories, each its own folder so the tree stays browsable. */
export const UPLOAD_KINDS = ["logos", "photos", "documents"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

for (const kind of UPLOAD_KINDS) {
  const dir = path.join(UPLOAD_ROOT, kind);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Random filename, original extension only.
 *
 * Never the client's filename: it can contain `../`, a null byte, or a name
 * that collides with someone else's file. The extension is derived from the
 * validated mime type, so a `.php` cannot ride in on an image upload.
 */
const EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    cb(null, path.join(UPLOAD_ROOT, kindOf(req)));
  },
  filename(_req, file, cb) {
    const schoolId = currentSchoolId() ?? "platform";
    cb(null, `${schoolId}-${Date.now()}-${randomBytes(6).toString("hex")}${EXTENSION[file.mimetype] ?? ""}`);
  },
});

function kindOf(req: Request): UploadKind {
  const kind = (req.params?.kind ?? req.query?.kind) as UploadKind | undefined;
  return kind && (UPLOAD_KINDS as readonly string[]).includes(kind) ? kind : "photos";
}

function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const allowed = kindOf(req) === "documents" ? DOCUMENT_TYPES : IMAGE_TYPES;
  if (!allowed.includes(file.mimetype)) {
    return cb(badRequest(`only ${allowed.join(", ")} are accepted here`));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  // Multer enforces this while streaming, so an oversized file never lands on disk.
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
});

/** The public URL for a stored file. Documents are served through the API. */
export const publicUrl = (kind: UploadKind, filename: string) => `/uploads/${kind}/${filename}`;

/**
 * Deletes a previously stored file, given the URL we handed out.
 *
 * Resolves the path and refuses anything that escapes the upload root, so a
 * crafted URL cannot talk this into unlinking a source file.
 */
export async function removeUpload(url?: string | null): Promise<void> {
  if (!url?.startsWith("/uploads/")) return;

  const target = path.resolve(UPLOAD_ROOT, url.replace("/uploads/", ""));
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return;

  await unlink(target).catch(() => {});
}
