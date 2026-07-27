// Grooming photo storage on AWS S3.
//
// The bucket is PRIVATE ("Block all public access" stays on). Nothing is ever
// served straight from S3:
//   * uploads  — the browser PUTs to a short-lived presigned URL, so the image
//                never passes through the Next.js server (dodges Vercel's 4.5 MB
//                request body cap and keeps phone uploads fast).
//   * viewing  — /p/<photoId> redirects to a freshly signed GET URL, so links we
//                put in a WhatsApp message keep working forever without the
//                bucket ever being public.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PhotoKind } from "@prisma/client";

const BUCKET = process.env.S3_BUCKET ?? "";
const REGION = process.env.S3_REGION ?? "ap-southeast-1";

// Photos are optional infrastructure — if the keys aren't set the rest of the
// admin keeps working and the UI just hides the camera steps.
export const isS3Configured = () =>
  Boolean(BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

// Only formats a phone camera actually produces. Anything else is rejected
// before we hand out an upload URL.
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const isAllowedImageType = (t: string) => t in EXT;

// Grouped per appointment so the bucket stays browsable by booking code, and
// timestamped so a retake never collides with the shot it replaces.
export function photoKey(code: string, kind: PhotoKind, contentType: string, now: number): string {
  const safeCode = code.replace(/[^A-Za-z0-9-]/g, "");
  return `appointments/${safeCode}/${kind.toLowerCase()}-${now}.${EXT[contentType] ?? "jpg"}`;
}

// Upload from OUR server rather than the browser. A server-to-S3 call is not a
// cross-origin browser request, so no bucket CORS rule is involved — which is
// why this path works on a bucket that has none.
export async function putPhotoObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

// URL for viewing. One hour is plenty — /p/<id> mints a new one on every visit.
export function presignView(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

// Best-effort cleanup when a photo row is replaced; never blocks the caller.
export async function deletePhotoObject(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // An orphaned object costs a fraction of a cent — not worth failing a groom over.
  }
}
