// Photo upload endpoint. The browser posts the compressed image HERE (same
// origin, so no CORS is involved) and this route forwards it to S3 server-side.
//
// The alternative — handing the browser a presigned URL to PUT straight at S3 —
// is leaner, but it is a cross-origin request and needs a CORS rule on the
// bucket. This path trades a little bandwidth for working on any bucket config.
// Body size is the one limit to respect: Vercel caps requests at 4.5 MB, and the
// client compresses to ~200 KB before sending, so there is plenty of room.
import { NextResponse } from "next/server";
import { PhotoKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/session";
import {
  deletePhotoObject,
  isAllowedImageType,
  isS3Configured,
  photoKey,
  putPhotoObject,
} from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous ceiling: the client sends ~200 KB, so anything near this is a bug or
// an upload that bypassed compression.
const MAX_BYTES = 4 * 1024 * 1024;

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  // Not covered by middleware (that guards /admin/*), so check auth here.
  const admin = await getCurrentAdmin();
  if (!admin) return bad("Unauthorized", 401);
  if (!isS3Configured()) return bad("Photo storage is not configured.", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Malformed upload.");
  }

  const file = form.get("file");
  const appointmentId = String(form.get("appointmentId") ?? "");
  const kindRaw = String(form.get("kind") ?? "");

  if (!(file instanceof File)) return bad("No image received.");
  if (kindRaw !== PhotoKind.BEFORE && kindRaw !== PhotoKind.AFTER) return bad("Invalid photo kind.");
  const kind = kindRaw as PhotoKind;

  const contentType = file.type || "image/jpeg";
  if (!isAllowedImageType(contentType)) return bad("Only JPEG, PNG or WebP images.");
  if (file.size > MAX_BYTES) return bad("That image is too large.", 413);
  if (file.size === 0) return bad("That image is empty.");

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { code: true },
  });
  if (!appt) return bad("Appointment not found.", 404);

  const key = photoKey(appt.code, kind, contentType, Date.now());
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    await putPhotoObject(key, buf, contentType);
  } catch {
    return bad("Storage rejected the upload. Check the S3 credentials.", 502);
  }

  // A retake replaces the row and bins the object it supersedes.
  const existing = await prisma.appointmentPhoto.findUnique({
    where: { appointmentId_kind: { appointmentId, kind } },
  });
  const photo = await prisma.appointmentPhoto.upsert({
    where: { appointmentId_kind: { appointmentId, kind } },
    update: { s3Key: key, contentType, bytes: buf.length, createdAt: new Date() },
    create: { appointmentId, kind, s3Key: key, contentType, bytes: buf.length },
  });
  if (existing && existing.s3Key !== key) await deletePhotoObject(existing.s3Key);

  await prisma.auditLog.create({
    data: {
      adminUserId: admin.sub,
      action: "PHOTO_UPLOAD",
      entity: "Appointment",
      entityId: appointmentId,
      meta: { kind, key, bytes: buf.length } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, photoId: photo.id });
}
