import Link from "next/link";
import Confirmation from "./Confirmation";
import styles from "../job-report.module.css";
export const dynamic="force-dynamic";
export default async function ThanksPage({searchParams}:{searchParams:Promise<{session_id?:string}>}) {
  const {session_id}=await searchParams;
  return <main className={styles.page}><section className={`${styles.single} ${styles.card}`}><p className={styles.eyebrow}>THE JOB REPORT BY EOD-HUB</p><h1>Thanks for subscribing.</h1><Confirmation sessionId={session_id}/><p>You can manage or cancel your subscription by requesting a private link at any time.</p><Link className={styles.action} href="/promote/job-report/manage">Manage subscription</Link><p className={styles.notice}>Contact: hello@eod-hub.com</p></section></main>;
}
