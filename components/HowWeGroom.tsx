import { GROOMING_VIDEOS } from "@/lib/data";
import InViewVideo from "./InViewVideo";
import Reveal from "./Reveal";
import styles from "./HowWeGroom.module.css";

export default function HowWeGroom() {
  return (
    <section id="process" className={`section-pad ${styles.wrap}`}>
      <span className="blob" style={{ background: "#ffd0e8", width: 380, height: 380, top: 40, right: -120 }} />
      <div className="container">
        <div className="center">
          <span className="eyebrow">🎬 The Bubbly Pup Series</span>
          <h2 className="section-title">How we do the grooming</h2>
          <p className="section-sub">
            A behind-the-scenes film series — every chapter shows the love,
            patience and craft that goes into your pet&apos;s glow-up.
          </p>
        </div>

        <div className={styles.editorial}>
          {GROOMING_VIDEOS.map((v, i) => (
            <Reveal
              key={v.src}
              className={`${styles.feature} ${
                i % 2 === 1 ? styles.flip : ""
              }`}
            >
              <div className={styles.screen}>
                <InViewVideo
                  src={v.src}
                  poster={v.src.replace(/\.mp4$/, "-poster.jpg")}
                  className={styles.video}
                />
                <div className={styles.scan} />
                <span className={styles.chapter}>{v.chapter}</span>
              </div>
              <div className={styles.meta}>
                <span className={styles.index}>
                  {String(i + 1).padStart(2, "0")}
                  <em>/0{GROOMING_VIDEOS.length}</em>
                </span>
                <h3 className={styles.featureTitle}>{v.title}</h3>
                <p className={styles.caption}>{v.caption}</p>
                <span className={styles.rule} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
