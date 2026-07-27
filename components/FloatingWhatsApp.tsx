import { SITE } from "@/lib/data";
import styles from "./FloatingWhatsApp.module.css";

export default function FloatingWhatsApp() {
  const href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
    "Hi Bubbly Pup Pet Grooming! I'd like to book grooming for my dog 🐾"
  )}`;
  return (
    <a
      className={styles.fab}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <span className={styles.ping} />
      <span className={styles.glyph}>💬</span>
      <span className={styles.label}>Book on WhatsApp</span>
    </a>
  );
}
