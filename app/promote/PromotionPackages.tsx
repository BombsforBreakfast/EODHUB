import { Check } from "lucide-react";
import CopyPromotionEmail from "./CopyPromotionEmail";
import styles from "./promote.module.css";

const packages = [
  {
    name: "Basic",
    price: "9.99",
    description: "One focused message. A simple way to get the word out.",
    features: [
      "One EOD-HUB-branded flyer",
      "One coordinated promotional post across agreed channels",
      "Standard EOD-HUB feed placement",
      "One destination link",
      "One minor creative revision",
    ],
    note: "One-time promotion. No 30-day featured placement.",
  },
  {
    name: "Featured",
    price: "24.99",
    description: "A 30-day campaign with an agreed featured placement.",
    features: [
      "Everything in Basic",
      "30-day featured placement on agreed EOD-HUB surfaces",
      "Internal Story promotion, subject to availability",
      "One destination link",
      "Tracked link clicks and a campaign summary",
    ],
    note: "We confirm available placements before invoicing.",
  },
  {
    name: "Premium",
    price: "49.99",
    description: "More room for your story, your listings, and your links.",
    features: [
      "Everything in Featured",
      "A dedicated public campaign landing page",
      "Up to 5 properties, products, services, or opportunities",
      "Individual destination links and click reporting",
      "Facebook and Instagram Story promotion",
    ],
    note: "Instagram pinning is offered only when a slot is confirmed.",
  },
];

export default function PromotionPackages() {
  return (
    <>
      <section className={styles.packagesSection} aria-labelledby="packages-heading">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>PROMOTION PACKAGES</p>
          <h2 id="packages-heading">Choose your starting point.</h2>
          <p>Tell us what you have in mind. We’ll confirm the placements, schedule, and deliverables with you before sending an invoice.</p>
        </div>
        <div className={styles.packagesGrid}>
          {packages.map((item) => (
            <article key={item.name} className={`${styles.packageCard} ${item.name === "Featured" ? styles.featuredCard : ""}`}>
              {item.name === "Featured" ? <span className={styles.packageBadge}>FEATURED OPTION</span> : null}
              <h3>{item.name}</h3>
              <p className={styles.price}><span>$</span>{item.price}<small>one time</small></p>
              <p className={styles.packageDescription}>{item.description}</p>
              <ul className={styles.featureList}>
                {item.features.map((feature) => <li key={feature}><Check size={17} aria-hidden="true" /><span>{feature}</span></li>)}
              </ul>
              <p className={styles.packageNote}>{item.note}</p>
              <CopyPromotionEmail
                className={item.name === "Featured" ? styles.primaryButton : styles.secondaryButton}
                label={`Copy email to ask about ${item.name}`}
              />
            </article>
          ))}
        </div>
        <p className={styles.packageDisclosure}>No automatic renewal. No guaranteed impressions, leads, or sales. Paid social boosts are not included. Stories are temporary; a 30-day campaign refers to its agreed featured placements.</p>
      </section>

      <section className={styles.processSection} aria-labelledby="process-heading">
        <div><p className={styles.eyebrow}>A PERSONAL APPROACH</p><h2 id="process-heading">Reviewed by a person.<br />Built for this community.</h2></div>
        <ol className={styles.processList}>
          <li><span>01</span><div><h3>Tell us what you’re promoting.</h3><p>Email your idea, a destination link, and your preferred timing. We’ll review it together.</p></div></li>
          <li><span>02</span><div><h3>Agree on the details.</h3><p>We confirm the package and available placements, then send a one-time Square invoice.</p></div></li>
          <li><span>03</span><div><h3>Prepare it. Approve it. Publish it.</h3><p>Production begins after payment. We review the finished promotion before publishing; the campaign clock starts when it goes live.</p></div></li>
        </ol>
      </section>

      <section className={styles.contactBand}>
        <div><h2>Have something a little different?</h2><p>Start with an email. We’ll help find the right fit.</p></div>
        <CopyPromotionEmail className={styles.secondaryButton} />
      </section>
    </>
  );
}
