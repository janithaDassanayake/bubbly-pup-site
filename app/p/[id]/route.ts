// Public photo link — the URL we put in the client's WhatsApp message.
//
// Presigned S3 URLs expire, so we can't paste one into a message the client may
// open days later. Instead this stable route mints a fresh signed URL on every
// visit and redirects to it. The bucket stays private; the link never rots.
//
// Access control is the unguessable cuid in the path: the client isn't logged
// in, and a groomed-dog photo is what we're deliberately sending them. Nothing
// here reveals other appointments, and the id can't be enumerated.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isS3Configured, presignView } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isS3Configured()) return new NextResponse("Photo storage not configured", { status: 503 });

  const photo = await prisma.appointmentPhoto.findUnique({
    where: { id },
    select: { s3Key: true },
  });
  if (!photo) return new NextResponse("Photo not found", { status: 404 });

  const url = await presignView(photo.s3Key);
  // 302 + no-store: the signed target expires, so this hop must never be cached.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
