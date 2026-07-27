import { SITE } from "@/lib/data";
import styles from "./Footer.module.css";

// Contact rows share one icon/text grid so the three values start on the same
// x-position — emoji glyphs are different widths, so inline "📍 text" left the
// address, email and phone each starting somewhere slightly different.
function ContactRow({
  icon,
  children,
  ...link
}: {
  icon: string;
  children: React.ReactNode;
} & React.ComponentProps<"a">) {
  return (
    <a {...link} className={styles.contactRow}>
      <span className={styles.contactIcon} aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </a>
  );
}

export default function Footer() {
  return (
    <footer id="contact" className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.col}>
          <h4>Explore</h4>
          <a href="#pricing">Pricing</a>
          <a href="#process">How We Groom</a>
          <a href="#learn">Good to Know</a>
          <a href="#reviews">Reviews</a>
        </div>

        <div className={styles.col}>
          <h4>Get in touch</h4>
          <ContactRow
            icon="💬"
            href={`https://wa.me/${SITE.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SITE.whatsappDisplay}
          </ContactRow>
          <ContactRow icon="✉️" href={`mailto:${SITE.email}`}>
            {SITE.email}
          </ContactRow>
          <ContactRow
            icon="📍"
            href={SITE.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SITE.address}
          </ContactRow>
        </div>

        <div className={styles.col}>
          <h4>Ready to book?</h4>
          <p className={styles.small}>
            Send your reservation straight to our WhatsApp — confirmed in
            minutes.
          </p>
          <a href="#booking" className="btn btn-primary">
            Make a Reservation
          </a>
        </div>
      </div>

      {/* Full width on purpose. Google's embed draws a fixed ~290px info card
          over the top-left corner; in a narrow column that card covers the whole
          map. Wide, it reads as a map with a label on it. */}
      <div className={`container ${styles.mapWrap}`}>
        <div className={styles.mapHead}>
          <h4>Find us</h4>
          <a
            href={SITE.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapLink}
          >
            Get directions →
          </a>
        </div>
        <div className={styles.mapFrame}>
          <iframe
            className={styles.map}
            src={SITE.mapEmbed}
            title={`Map to ${SITE.name}, ${SITE.address}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>

      <div className={styles.bar}>
        <div className={`container ${styles.barInner}`}>
          <span>© {SITE.name}. Made with 💖 for happy pets.</span>
          <span>Pampering pets to glow with happiness 🫧</span>
        </div>
      </div>
    </footer>
  );
}
