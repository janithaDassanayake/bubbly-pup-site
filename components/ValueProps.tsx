import { VALUE_PROPS } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./ValueProps.module.css";

export default function ValueProps() {
  return (
    <section className={styles.wrap}>
      <div className="container">
        <div className={styles.grid}>
          {VALUE_PROPS.map((v, i) => (
            <Reveal key={v.title} className={styles.card} delay={i * 90}>
              <span className={styles.emoji}>{v.emoji}</span>
              <h3>{v.title}</h3>
              <p>{v.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
