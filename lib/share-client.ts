// Browser-only: hand real image FILES to WhatsApp via the native share sheet.
//
// A wa.me / whatsapp:// link can only carry text — there is no way to attach an
// image to one. The Web Share API is the only free route to an actual photo
// message: navigator.share({files}) opens the OS share sheet, the user taps
// WhatsApp, and both images go in as genuine attachments with the text as the
// caption. Supported on Android Chrome and iOS Safari, which is where grooming
// staff actually work.
//
// Two rules this file exists to respect:
//  1. share() must be called inside a user gesture — anything awaited first
//     (a fetch, an upload) makes iOS reject it. So the files are prepared in
//     advance and the send button's tap calls share() directly.
//  2. canShare({files}) must be checked before offering it; desktop browsers
//     mostly can't share files and need the link fallback.

export const canShareFiles = (files: File[]): boolean =>
  typeof navigator !== "undefined" &&
  typeof navigator.canShare === "function" &&
  navigator.canShare({ files });

// Pull a stored photo back down as a File, ready to attach.
export async function fileFromPhoto(photoId: string, name: string): Promise<File> {
  const res = await fetch(`/p/${photoId}`);
  if (!res.ok) throw new Error("Couldn't load the photo");
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

// Desktop route: no browser can attach a file to WhatsApp Web from a link, but
// WhatsApp Web accepts a pasted image. So we put the composite on the clipboard
// and the user presses Ctrl+V in the chat — a real photo, not a link.
//
// Only image/png is reliably accepted by the clipboard, and this needs a secure
// context (https or localhost) plus a user gesture.
export const canCopyImage = (): boolean =>
  typeof navigator !== "undefined" &&
  typeof window !== "undefined" &&
  window.isSecureContext &&
  typeof navigator.clipboard?.write === "function" &&
  typeof ClipboardItem !== "undefined";

export async function copyImage(png: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}

// Last resort when neither sharing nor the clipboard is available: save the
// composite so it can be attached by hand.
export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

export async function sharePhotos(files: File[], text: string): Promise<ShareOutcome> {
  if (!canShareFiles(files)) return "unsupported";
  try {
    await navigator.share({ files, text });
    return "shared";
  } catch (e) {
    // The user backing out of the share sheet is not an error worth showing.
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    // iOS throws NotAllowedError when the gesture has been lost.
    if (e instanceof DOMException && e.name === "NotAllowedError") return "failed";
    return "failed";
  }
}
