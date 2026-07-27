import { TESTIMONIALS } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Testimonials.module.css";

export default function Testimonials() {
  return (
    <section id="reviews" className={`section-pad ${styles.wrap}`}>
      <span className="blob" style={{ background: "#ffd9ec", width: 360, height: 360, bottom: -120, left: -100 }} />
      <div className="container">
        <div className="center">
          <span className="eyebrow">💕 Happy Tails</span>
          <h2 className="section-title">Loved by pets &amp; their parents</h2>
          <p className="section-sub">
            Don&apos;t just take our word for it — here&apos;s what the Bubbly
            Pup family has to say.
          </p>
        </div>

        <div className={styles.grid}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} className={styles.card} delay={(i % 2) * 90}>
              <div className={styles.stars}>
                {Array.from({ length: t.rating }).map((_, s) => (
                  <span key={s}>★</span>
                ))}
              </div>
              <p className={styles.quote}>“{t.text}”</p>
              <div className={styles.who}>
                <span className={styles.avatar}>🐾</span>
                <div>
                  <strong>{t.name}</strong>
                  <span className={styles.pet}>{t.pet}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
