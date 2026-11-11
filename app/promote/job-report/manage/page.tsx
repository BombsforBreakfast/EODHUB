import Link from "next/link";
import ReportForm from "../ReportForm";
import styles from "../job-report.module.css";
export const dynamic="force-dynamic";
export default async function ManageReportPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const {token}=await searchParams;
  return <main className={styles.page}><header className={styles.header}><Link href="/promote/job-report" className={styles.brand}>EOD-HUB / THE JOB REPORT</Link></header><section className={`${styles.single} ${styles.card}`}><h1>Manage your Job Report</h1><p>Cancel future renewals, update your payment method, or view invoices. No EOD-HUB account required. This changes only The Job Report.</p>{token?<><form className={styles.form} action="/api/job-report/portal" method="post"><input type="hidden" name="token" value={token}/><button type="submit">Open secure billing management</button></form><p className={styles.notice}>Management links are private, single use, and valid for one hour.</p></>:null}<h2>{token?"Need a fresh link?":"Get a private management link"}</h2><ReportForm manage/><p className={styles.notice}>Questions? <a href="mailto:hello@eod-hub.com">hello@eod-hub.com</a></p></section></main>;
}
