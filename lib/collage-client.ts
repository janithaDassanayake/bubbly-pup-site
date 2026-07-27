// Browser-only: stitch the before and after shots into ONE side-by-side image.
//
// Why one image instead of two attachments:
//  * desktop — the clipboard holds a single image, so one composite means one
//    copy and one paste into WhatsApp Web instead of two awkward rounds;
//  * mobile — one clean photo in the chat rather than two the client has to
//    flip between;
//  * the comparison is the whole point, and side-by-side makes it immediate.

const PANEL_H = 900; // output height in px — sharp on a phone, still a small file
const GAP = 8;
const PAD = 0;
const LABEL_H = 54;

type Decoded = { img: CanvasImageSource; w: number; h: number };

async function decode(blob: Blob): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(blob);
    return { img: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { img, w: img.naturalWidth, h: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Fill the panel edge to edge, cropping the overflow, so the two halves line up
// even when the shots have different aspect ratios (portrait vs landscape).
function drawCover(
  ctx: CanvasRenderingContext2D,
  d: Decoded,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const scale = Math.max(dw / d.w, dh / d.h);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (d.w - sw) / 2;
  const sy = (d.h - sh) / 2;
  ctx.drawImage(d.img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, w: number) {
  ctx.fillStyle = "rgba(219, 58, 141, 0.92)"; // brand pink
  ctx.fillRect(cx, y, w, LABEL_H);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.round(LABEL_H * 0.46)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx + w / 2, y + LABEL_H / 2 + 1);
}

export type Collage = { jpeg: Blob; png: Blob; width: number; height: number };

// PNG as well as JPEG because the clipboard only reliably accepts image/png,
// while JPEG keeps the shared/attached file small.
export async function makeBeforeAfter(beforeBlob: Blob, afterBlob: Blob): Promise<Collage> {
  const [b, a] = await Promise.all([decode(beforeBlob), decode(afterBlob)]);

  // Each panel keeps its own aspect ratio at a shared height.
  const bw = Math.round((b.w / b.h) * PANEL_H);
  const aw = Math.round((a.w / a.h) * PANEL_H);
  const width = bw + aw + GAP + PAD * 2;
  const height = PANEL_H + PAD * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't build the before/after image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawCover(ctx, b, PAD, PAD, bw, PANEL_H);
  drawCover(ctx, a, PAD + bw + GAP, PAD, aw, PANEL_H);

  label(ctx, "BEFORE", PAD, PAD + PANEL_H - LABEL_H, bw);
  label(ctx, "AFTER", PAD + bw + GAP, PAD + PANEL_H - LABEL_H, aw);

  if ("close" in b.img) (b.img as ImageBitmap).close();
  if ("close" in a.img) (a.img as ImageBitmap).close();

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't build the before/after image."))),
        type,
        quality
      )
    );

  const [jpeg, png] = await Promise.all([toBlob("image/jpeg", 0.85), toBlob("image/png")]);
  return { jpeg, png, width, height };
}
