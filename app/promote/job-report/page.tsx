import type { Metadata } from "next";
import Link from "next/link";
import ReportForm from "./ReportForm";
import styles from "./job-report.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"The Job Report by EOD-HUB",description:"Newly approved EOD job opportunities by email. Expect 4–6 reports most weeks. $1.99/month. No EOD-HUB account required."};
export default function JobReportPage() {
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/login" className={styles.brand}>EOD-HUB</Link><Link href="/promote/job-report/manage">Manage subscription</Link></header>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>THE JOB REPORT BY EOD-HUB</p><h1>Your next opportunity.<br/>In your inbox.</h1><p className={styles.intro}>Newly approved EOD job opportunities, delivered straight to your email. Spend less time checking job boards and more time finding your next role.</p>
      <ul className={styles.features}><li><strong>Expect 4–6 reports most weeks.</strong><br/>Timing depends on job availability and review activity.</li><li><strong>No filler emails.</strong><br/>Reports go out only when newly approved opportunities are available.</li><li><strong>Go straight to the original listing.</strong><br/>Review the details and apply through USAJOBS, Adzuna, ReliefWeb, or the original source.</li><li><strong>No EOD-HUB account needed.</strong><br/>This email subscription is separate from EOD-HUB membership and access.</li></ul></div>
      <aside className={styles.card}><p className={styles.eyebrow}>OPPORTUNITIES. NOT ANOTHER LOGIN.</p><div className={styles.price}>$1.99<small> / month USD</small></div><p>Your first report includes that day’s approved jobs and is sent after successful payment, when jobs are available. Later reports arrive in the evening, Eastern Time.</p>{process.env.JOB_REPORT_LIVE_TEST_ONLY==="true"?<p className={styles.notice}>Limited live test. Public subscriptions will open after validation.</p>:null}<ReportForm/><p className={styles.notice}>Already subscribed? <Link href="/promote/job-report/manage">Manage or cancel here.</Link></p></aside>
    </section>
    <p className={styles.legal}>Listings are supplied by their original sources. Availability and application requirements can change; verify details with the listing provider. We do not guarantee employment or a fixed number of jobs. Cancel future renewals anytime; service remains available through the paid period unless you choose to stop emails. Cancellation does not automatically create a prorated refund.</p>
    <footer className={styles.links}><span>EOD-HUB LLC</span><a href="mailto:hello@eod-hub.com">hello@eod-hub.com</a><Link href="/privacy">Privacy</Link><Link href="/promote/job-report/manage">Manage or cancel</Link></footer>
  </main>;
}
