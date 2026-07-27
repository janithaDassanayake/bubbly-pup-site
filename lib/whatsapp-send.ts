// Server-side WhatsApp sending via the Meta Cloud API. Optional: only active when
// WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set. When configured, the
// thank-you message is sent automatically FROM the business number TO the customer.
// When not configured, callers fall back to the free one-tap wa.me link.
//
// Note: messages sent OUTSIDE WhatsApp's 24-hour customer-service window (a
// post-visit thank-you almost always is) require a pre-approved TEMPLATE. Set
// WHATSAPP_TEMPLATE_NAME (+ optional WHATSAPP_TEMPLATE_LANG, default en) to use it;
// otherwise a plain text send is attempted (works only within the 24h window).
import { toWaNumber } from "./whatsapp";

const GRAPH_VERSION = "v21.0";

export function isCloudApiConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

type SendResult = { ok: boolean; id?: string; error?: string };

async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp Cloud API not configured." };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// Sends the thank-you. Uses the approved template if configured (required outside
// the 24h window), else a plain text send. `params` fill the template's {{1}}, {{2}}…
export async function sendThankYou(
  toPhone: string,
  body: string,
  params: string[] = []
): Promise<SendResult> {
  const to = toWaNumber(toPhone);
  const template = process.env.WHATSAPP_TEMPLATE_NAME;

  if (template) {
    return postMessage({
      to,
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        ...(params.length
          ? { components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }] }
          : {}),
      },
    });
  }

  return postMessage({ to, type: "text", text: { preview_url: false, body } });
}
