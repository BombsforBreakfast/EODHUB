import Unsubscribe from "./Unsubscribe";
import styles from "../job-report.module.css";
export const dynamic="force-dynamic";
export default async function UnsubscribePage({searchParams}:{searchParams:Promise<{token?:string}>}) {
 const {token}=await searchParams;
 return <main className={styles.page}><section className={`${styles.single} ${styles.card}`}><p className={styles.eyebrow}>THE JOB REPORT BY EOD-HUB</p><h1>Unsubscribe</h1><Unsubscribe token={token??""}/></section></main>;
}
