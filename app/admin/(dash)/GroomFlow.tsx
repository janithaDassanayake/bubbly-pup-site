"use client";
// The grooming stage of an appointment, reduced to three taps:
//
//   Groom Started  → capture/upload the BEFORE photo → status GROOMING_STARTED
//   Groom Finished → status GROOM_FINISHED
//   Done           → capture/upload the AFTER photo  → status COMPLETED + WhatsApp
//
// The photo is uploaded FIRST and the status only advances once it's safely in
// S3, so a failed upload leaves the appointment where it was instead of stranding
// it in a state whose photo never arrived.
import { useRef, useState, useTransition } from "react";
import { AppointmentStatus, PhotoKind } from "@prisma/client";
import { changeStatus, completionMessage, markNotificationSent } from "../actions";
import { compressImage } from "@/lib/image-client";
import {
  canCopyImage,
  canShareFiles,
  copyImage,
  downloadImage,
  fileFromPhoto,
  sharePhotos,
} from "@/lib/share-client";
import { makeBeforeAfter, type Collage } from "@/lib/collage-client";
import { StatusActions } from "./ActionButtons";

const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// Same targets as ActionButtons: the app on mobile (no blank tab, page stays),
// WhatsApp Web on desktop (skips the wa.me "Continue to Chat" interstitial).
function waTargets(waMeHref: string): { app: string; web: string } {
  const m = waMeHref.match(/wa\.me\/(\d+)\?text=(.*)$/);
  const phone = m?.[1] ?? "";
  const text = m?.[2] ?? "";
  return {
    app: `whatsapp://send?phone=${phone}&text=${text}`,
    web: `https://web.whatsapp.com/send?phone=${phone}&text=${text}`,
  };
}

function openWa(waMeHref: string, preOpened?: Window | null) {
  const { app, web } = waTargets(waMeHref);
  if (isMobile()) window.location.href = app;
  else if (preOpened) preOpened.location.href = web;
  else window.open(web, "_blank", "noopener,noreferrer");
}

export type PhotoRef = { id: string; kind: PhotoKind };

// Everything needed to send the before/after message, prepared while the upload
// runs so the send button's tap can call share() synchronously.
type SendKit = {
  notificationId: string;
  href: string;
  hrefWithLinks?: string;
  collage: Collage | null;
  text: string;
};

// Three ways to get a REAL image into the chat, best first. Every one of them
// must start inside the click gesture — hence no awaits before the first branch.
function sendBeforeAfter(kit: SendKit, setMsg: (s: string) => void, onSent: () => void) {
  const file = kit.collage
    ? new File([kit.collage.jpeg], "before-after.jpg", { type: "image/jpeg" })
    : null;

  // 1. Mobile: the native share sheet attaches the image to the WhatsApp message.
  if (file && canShareFiles([file])) {
    sharePhotos([file], kit.text).then((outcome) => {
      if (outcome === "shared") {
        onSent();
        setMsg("Sent on WhatsApp ✓");
      } else if (outcome === "cancelled") {
        setMsg("Cancelled — tap Send again");
      } else {
        copyOrLink(kit, setMsg, onSent);
      }
    });
    return;
  }

  copyOrLink(kit, setMsg, onSent);
}

function copyOrLink(kit: SendKit, setMsg: (s: string) => void, onSent: () => void) {
  // 2. Desktop: WhatsApp Web takes a pasted image, so copy it and open the chat.
  if (kit.collage && canCopyImage()) {
    // The tab must be opened inside the gesture, before the copy await, or the
    // popup blocker eats it.
    const win = isMobile() ? null : window.open("", "_blank");
    copyImage(kit.collage.png).then((copied) => {
      openWa(kit.href, win);
      onSent();
      setMsg(
        copied ? "Image copied — press Ctrl+V in the chat, then send" : "Opened in WhatsApp"
      );
    });
    return;
  }

  // 3. Neither available: save the image so it can be attached by hand, and send
  //    the message with photo links so the client still gets something.
  if (kit.collage) downloadImage(kit.collage.jpeg, "before-after.jpg");
  openWa(kit.hrefWithLinks ?? kit.href);
  onSent();
  setMsg(kit.collage ? "Image saved — attach it in WhatsApp" : "Opened in WhatsApp");
}

export function GroomFlow({
  id,
  status,
  photos,
  autoSend,
}: {
  id: string;
  status: AppointmentStatus;
  photos: PhotoRef[];
  autoSend?: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [send, setSend] = useState<SendKit | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Which photo the file picker is currently collecting, and what to do after.
  const target = useRef<PhotoKind | null>(null);
  // The compressed AFTER photo, kept so it can be attached without re-downloading.
  const blobOfLastUpload = useRef<Blob | null>(null);

  const before = photos.find((p) => p.kind === "BEFORE");
  const after = photos.find((p) => p.kind === "AFTER");

  // accept="image/*" with no `capture` lets the OS offer BOTH — "Take Photo" and
  // "Photo Library" on a phone, a normal file dialog on desktop.
  const pick = (kind: PhotoKind) => {
    setErr("");
    setOkMsg("");
    target.current = kind;
    fileRef.current?.click();
  };

  async function upload(file: File, kind: PhotoKind): Promise<boolean> {
    setBusy(kind === "BEFORE" ? "Saving before photo…" : "Saving after photo…");
    try {
      const { blob, contentType } = await compressImage(file);
      blobOfLastUpload.current = blob;

      // Posted to our own origin, so no bucket CORS rule is needed; the server
      // forwards it to S3.
      const body = new FormData();
      body.append("file", new File([blob], "photo.jpg", { type: contentType }));
      body.append("appointmentId", id);
      body.append("kind", kind);

      let res: Response;
      try {
        res = await fetch("/api/admin/photos", { method: "POST", body });
      } catch {
        // fetch only throws when the request never completed at all.
        throw new Error("Couldn't reach the server — check your connection.");
      }
      const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? `Upload failed (${res.status}).`);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      return false;
    } finally {
      setBusy("");
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a retake
    const kind = target.current;
    target.current = null;
    if (!file || !kind) return;

    start(async () => {
      const ok = await upload(file, kind);
      if (!ok) return;

      if (kind === "BEFORE") {
        // Only advance once the photo is stored.
        if (status === "ARRIVED") {
          // A rejected action would escape the transition and crash the page.
          const r = await changeStatus(id, "GROOMING_STARTED").catch(() => null);
          if (!r) return setErr("Couldn't reach the server — refresh to check.");
          if (!r.ok) return setErr(r.error ?? "Failed");
        }
        setOkMsg("Before photo saved ✓");
        return;
      }

      // AFTER photo → complete the appointment (settles payment) and prepare the
      // before+after message.
      const r = await changeStatus(id, "COMPLETED").catch(() => null);
      if (!r) return setErr("Couldn't reach the server — refresh to check.");
      if (!r.ok) return setErr(r.error ?? "Failed");
      if (r.autoSent) return setOkMsg("Completed — thank-you sent ✓");
      if (!r.whatsapp) return setOkMsg("Completed ✓");

      // Build the composite NOW, so tapping Send goes straight to the share sheet
      // or clipboard with no await in between (iOS drops the gesture otherwise).
      let collage: Collage | null = null;
      try {
        if (r.photos?.before && blobOfLastUpload.current) {
          const beforeFile = await fileFromPhoto(r.photos.before, "before.jpg");
          collage = await makeBeforeAfter(beforeFile, blobOfLastUpload.current);
        }
      } catch {
        // Fall through — the link fallback still works without a composite.
      }

      setSend({
        notificationId: r.whatsapp.notificationId,
        href: r.whatsapp.href,
        hrefWithLinks: r.whatsapp.hrefWithLinks,
        collage,
        text: decodeURIComponent(r.whatsapp.href.split("?text=")[1] ?? ""),
      });
      setOkMsg("Completed ✓ — now send the photo");
    });
  };

  const doSend = (kit: SendKit) =>
    sendBeforeAfter(kit, setOkMsg, () => {
      markNotificationSent(kit.notificationId).catch(() => {});
      setSent(true);
    });

  const working = pending || Boolean(busy);

  // Pre-arrival states keep the normal confirm/cancel/no-show controls — without
  // them there'd be no way to confirm a booking or mark a no-show.
  const inGroomStage =
    status === "ARRIVED" ||
    status === "GROOMING_STARTED" ||
    status === "GROOM_FINISHED" ||
    status === "PAID" ||
    status === "COMPLETED";

  if (!inGroomStage) return <StatusActions id={id} status={status} autoSend={autoSend} />;

  return (
    <div className="adm-groom">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: "none" }}
        aria-hidden
      />

      <div className="adm-btn-row">
        {status === "ARRIVED" && (
          <button className="adm-btn adm-btn-sm adm-btn-primary" disabled={working} onClick={() => pick("BEFORE")}>
            📷 Groom Started
          </button>
        )}

        {status === "GROOMING_STARTED" && (
          <button
            className="adm-btn adm-btn-sm adm-btn-primary"
            disabled={working}
            onClick={() =>
              start(async () => {
                setErr("");
                const r = await changeStatus(id, "GROOM_FINISHED").catch(() => null);
                if (!r) setErr("Couldn't reach the server — refresh to check.");
                else if (!r.ok) setErr(r.error ?? "Failed");
              })
            }
          >
            ✅ Groom Finished
          </button>
        )}

        {(status === "GROOM_FINISHED" || status === "PAID") && (
          <button className="adm-btn adm-btn-sm adm-btn-primary" disabled={working} onClick={() => pick("AFTER")}>
            📷 Done
          </button>
        )}

        {/* The photos ride out on this tap — share() needs a direct gesture. */}
        {send && (
          <button className="adm-btn adm-btn-sm adm-btn-wa" disabled={working} onClick={() => doSend(send)}>
            📤 {sent ? "Send again" : "Send before & after"}
          </button>
        )}

        {/* After a page reload the in-memory attachments are gone; this rebuilds
            them from S3, then sends on the following tap. */}
        {!send && status === "COMPLETED" && before && after && (
          <ResendPhotos id={id} beforeId={before.id} afterId={after.id} disabled={working} />
        )}

        {/* A groom in progress can still be abandoned. */}
        {status === "ARRIVED" && <StatusActions id={id} status={status} only={["CANCELLED", "NO_SHOW"]} />}
      </div>

      {(before || after) && (
        <div className="adm-thumbs">
          {before && <Thumb photoId={before.id} label="Before" onRetake={() => pick("BEFORE")} busy={working} />}
          {after && <Thumb photoId={after.id} label="After" onRetake={() => pick("AFTER")} busy={working} />}
        </div>
      )}

      {busy && <span className="adm-note">{busy}</span>}
      {okMsg && <span className="adm-note" style={{ color: "#1c7c3f" }}>{okMsg}</span>}
      {err && <span className="adm-note" style={{ color: "#c0392b" }}>{err}</span>}
    </div>
  );
}

// Re-sending after a reload takes two taps by necessity: the image files must be
// downloaded from S3 first, and share() can't be called after that await on iOS.
// So tap one loads, tap two shares.
function ResendPhotos({
  id,
  beforeId,
  afterId,
  disabled,
}: {
  id: string;
  beforeId: string;
  afterId: string;
  disabled: boolean;
}) {
  const [kit, setKit] = useState<SendKit | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const prepare = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await completionMessage(id);
      if (!r.ok || !r.whatsapp) throw new Error(r.error ?? "Couldn't build the message");
      const [beforeFile, afterFile] = await Promise.all([
        fileFromPhoto(beforeId, "before.jpg"),
        fileFromPhoto(afterId, "after.jpg"),
      ]);
      setKit({
        notificationId: r.whatsapp.notificationId,
        href: r.whatsapp.href,
        hrefWithLinks: r.whatsapp.hrefWithLinks,
        collage: await makeBeforeAfter(beforeFile, afterFile),
        text: decodeURIComponent(r.whatsapp.href.split("?text=")[1] ?? ""),
      });
      setMsg("Image ready — tap Send");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const share = () => {
    if (!kit) return;
    sendBeforeAfter(kit, setMsg, () => {
      markNotificationSent(kit.notificationId).catch(() => {});
    });
  };

  return (
    <>
      <button
        className="adm-btn adm-btn-sm adm-btn-wa"
        disabled={disabled || loading}
        onClick={kit ? share : prepare}
      >
        📤 {loading ? "Preparing…" : kit ? "Send before & after" : "Resend photos"}
      </button>
      {msg && <span className="adm-note">{msg}</span>}
    </>
  );
}

// /p/<id> redirects to a freshly signed S3 URL, so no credentials are exposed
// and the thumbnail keeps working after the signature would have expired.
function Thumb({
  photoId,
  label,
  onRetake,
  busy,
}: {
  photoId: string;
  label: string;
  onRetake: () => void;
  busy: boolean;
}) {
  return (
    <figure className="adm-thumb">
      <a href={`/p/${photoId}`} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/p/${photoId}`} alt={`${label} grooming`} loading="lazy" />
      </a>
      <figcaption>
        {label}
        <button type="button" className="adm-retake" onClick={onRetake} disabled={busy}>
          Retake
        </button>
      </figcaption>
    </figure>
  );
}
