// Browser-only: shrink a camera photo before it goes to S3.
//
// A modern phone shoots 3–5 MB. Nobody needs that for a before/after shot on
// WhatsApp, and on salon wifi it's the difference between an instant upload and
// the groomer standing there waiting. ~1280px at q0.75 lands around 150–250 KB
// and still looks sharp on a phone screen.

export type Compressed = { blob: Blob; contentType: string; width: number; height: number };

const MAX_DIM = 1280;
const QUALITY = 0.75;

// Phone cameras record rotation in EXIF rather than rotating the pixels, so a
// portrait shot arrives sideways unless the decoder is told to respect it.
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to an <img>, which applies EXIF orientation itself.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function compressImage(file: File): Promise<Compressed> {
  const src = await decode(file);
  const sw = "width" in src ? src.width : 0;
  const sh = "height" in src ? src.height : 0;
  if (!sw || !sh) throw new Error("Couldn't read that image.");

  const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
  if ("close" in src) src.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("Couldn't process that image.");

  return { blob, contentType: "image/jpeg", width, height };
}
