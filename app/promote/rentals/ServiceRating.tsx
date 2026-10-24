"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bomb, ChevronDown, ChevronUp, Pin, X } from "lucide-react";
import { getAccessToken, supabase } from "@/app/lib/lib/supabaseClient";
import { ratingSortLabels, type RatingSort, type RatingSummary, type ReviewPage, type ServiceReview } from "@/app/lib/rentals/serviceRatings";
import styles from "./rentals.module.css";

const endpoint = "/api/rentals/service-rating";
type RatingContextValue = {
  summary: RatingSummary | null; setSummary: (value: RatingSummary) => void;
  loadError: string; refresh: () => Promise<void>; headers: () => Record<string, string>;
  pin: (review: ServiceReview) => Promise<boolean>; pinning: string | null; pinError: string;
};
const RatingContext = createContext<RatingContextValue | null>(null);
function useRatings() {
  const context = useContext(RatingContext);
  if (!context) throw new Error("Service rating provider missing");
  return context;
}

export function ServiceRatingProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [pinError, setPinError] = useState("");
  const loadSequence = useRef(0);
  const headers = useCallback((): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {}, [token]);
  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch(endpoint, { cache: "no-store", headers: headers() });
      if (!response.ok) throw new Error();
      const data: RatingSummary = await response.json();
      if (sequence === loadSequence.current) { setSummary(data); setLoadError(""); }
    } catch { if (sequence === loadSequence.current) setLoadError("Ratings are temporarily unavailable. Please try again."); }
  }, [headers]);
  useEffect(() => {
    let active = true;
    void getAccessToken().then(value => { if (active) { setToken(value); setAuthReady(true); } }).catch(() => { if (active) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (active) { setToken(session?.access_token ?? null); setAuthReady(true); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (authReady) void refresh(); }, [authReady, refresh]);
  async function pin(review: ServiceReview) {
    setPinning(review.review_id); setPinError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ reviewId: review.review_id, pinned: !review.is_pinned }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSummary(data); return true;
    } catch (error) { setPinError(error instanceof Error ? error.message : "Could not update pinned feedback."); return false; }
    finally { setPinning(null); }
  }
  return <RatingContext.Provider value={{ summary, setSummary, loadError, refresh, headers, pin, pinning, pinError }}>{children}</RatingContext.Provider>;
}

function BombScore({ value, small = false }: { value: number; small?: boolean }) {
  return <span className={`${styles.bombs} ${small ? styles.smallBombs : ""}`} role="img" aria-label={`${value.toFixed(1)} out of 5 bombs`}>
    {Array.from({ length: 5 }, (_, index) => <span key={index} className={styles.bombSlot}><Bomb size={36} className={styles.bombEmpty} aria-hidden="true" /><span className={styles.bombFill} style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}><Bomb size={36} fill="currentColor" aria-hidden="true" /></span></span>)}
  </span>;
}

function OverallRating({ onRate, breakdownControl, reviewControl }: { onRate?: () => void; breakdownControl?: ReactNode; reviewControl?: ReactNode }) {
  const { summary } = useRatings();
  return <div className={styles.overallRating}>
    <div className={styles.ratingScoreLine}><div className={styles.averageScore}><strong>{summary?.average == null ? "—" : summary.average.toFixed(1)}</strong><span>out of 5 bombs</span></div><span className={styles.ratingCount}>{summary ? `${summary.count} ${summary.count === 1 ? "rating" : "ratings"}` : "Loading ratings…"}</span></div>
    <div className={styles.ratingBombLine}><BombScore value={summary?.average ?? 0} />{reviewControl}</div>
    <div className={styles.ratingSummaryActions}><a href="#rate-service" className={styles.ratingTextLink} onClick={onRate}>{summary && !summary.count ? "Be the first to rate" : "Leave a rating"} →</a>{breakdownControl}</div>
  </div>;
}

function RatingBreakdown() {
  const { summary } = useRatings();
  return <div className={styles.ratingBreakdown} aria-label="All rating scores">{[5, 4, 3, 2, 1].map(bombs => {
    const count = summary?.distribution.find(bucket => bucket.bombs === bombs)?.count ?? 0;
    return <div className={styles.breakdownRow} key={bombs}><span>{bombs - 0.5}–{bombs} bombs</span><span role="meter" aria-label={`${bombs - 0.5} to ${bombs} bombs`} aria-valuemin={0} aria-valuemax={summary?.count || 1} aria-valuenow={count} className={styles.breakdownTrack}><span style={{ width: `${summary?.count ? count / summary.count * 100 : 0}%` }} /></span><span>{count}</span></div>;
  })}</div>;
}

function ReviewCard({ review, onPin }: { review: ServiceReview; onPin?: () => void }) {
  const { summary, pinning } = useRatings();
  return <figure className={styles.testimonial}>
    <div className={styles.reviewTop}><BombScore value={Number(review.score)} small /><strong>{Number(review.score).toFixed(1)} / 5</strong></div>
    {review.is_pinned ? <span className={styles.pinnedLabel}><Pin size={12} /> Pinned by EOD-HUB</span> : null}
    {review.testimonial ? <blockquote>{review.testimonial}</blockquote> : <p className={styles.ratingCaption}>Rating only</p>}
    <figcaption>{review.display_name || "Community member"} · <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></figcaption>
    {summary?.canManage && onPin ? <button type="button" className={styles.pinButton} disabled={pinning !== null} onClick={onPin}><Pin size={13} />{pinning === review.review_id ? "Saving…" : review.is_pinned ? "Unpin feedback" : "Pin feedback"}</button> : null}
  </figure>;
}

function AllRatingsModal({ close }: { close: () => void }) {
  const { summary, headers, pin, pinError } = useRatings();
  const dialog = useRef<HTMLDialogElement>(null);
  const [sort, setSort] = useState<RatingSort>("featured");
  const [page, setPage] = useState<ReviewPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const load = useCallback(async (offset: number) => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`${endpoint}?view=all&sort=${sort}&offset=${offset}`, { cache: "no-store", headers: headers() });
      if (!response.ok) throw new Error();
      const result: ReviewPage = await response.json();
      if (sequence === requestSequence.current) setPage(current => ({ ...result, reviews: offset ? [...(current?.reviews ?? []), ...result.reviews] : result.reviews }));
    } catch { if (sequence === requestSequence.current) setError("Could not load ratings. Please try again."); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [sort, headers]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setPage(null); void load(0); }, [load]);
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.ratingsDialog}`} onClose={close} aria-labelledby="all-ratings-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className={styles.dialogContent}>
      <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>COMMUNITY FEEDBACK</p><h2 id="all-ratings-title">All ratings &amp; testimonials</h2></div><button type="button" className={styles.iconButton} aria-label="Close all ratings" onClick={() => dialog.current?.close()}><X /></button></header>
      <div className={styles.ratingOverview}><OverallRating onRate={() => dialog.current?.close()} /><RatingBreakdown /></div>
      <div className={styles.reviewToolbar}><p>{page?.total ?? summary?.count ?? 0} ratings · All scores included</p><label>Sort by <select value={sort} onChange={event => setSort(event.target.value as RatingSort)}>{Object.entries(ratingSortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <p className={styles.ratingCaption}>{sort === "featured" ? "Pinned feedback first, then highest rated. Newest first within each score." : sort === "newest" ? "Newest ratings first, regardless of score." : `${sort === "highest" ? "Highest" : "Lowest"} scores first. Newest first within each score.`}</p>
      <div className={styles.testimonialGrid} aria-busy={loading}>{page?.reviews.map(review => <ReviewCard key={review.review_id} review={review} onPin={() => { void pin(review).then(saved => { if (saved) void load(0); }); }} />)}</div>
      <p role="status" className={styles.ratingCaption}>{loading ? "Loading ratings…" : error || pinError || (page && !page.reviews.length ? "No ratings yet. Be the first to share your experience." : "")}</p>
      {page?.nextOffset != null ? <button type="button" className={styles.secondaryRatingButton} disabled={loading} onClick={() => void load(page.nextOffset!)}>Load more ratings</button> : null}
      {error && !page ? <button type="button" className={styles.secondaryRatingButton} onClick={() => void load(0)}>Retry loading ratings</button> : null}
      {!summary?.canManage ? <p className={styles.ratingCaption}><Link href="/login">Admin sign in</Link> to pin feedback.</p> : null}
    </div>
  </dialog>;
}

export function ServiceRatingSummary() {
  const { summary, loadError, refresh, pin, pinError } = useRatings();
  const [showAll, setShowAll] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <section className={styles.ratingSummary} aria-labelledby="rating-summary-title">
    <h2 id="rating-summary-title" className={styles.eyebrow}>COMMUNITY FEEDBACK</h2>
    <OverallRating reviewControl={<button ref={trigger} type="button" className={`${styles.secondaryRatingButton} ${styles.showAllRatings}`} onClick={() => setShowAll(true)}>Show all ratings</button>} breakdownControl={<button type="button" className={styles.breakdownToggle} aria-expanded={showBreakdown} aria-controls="rating-breakdown" onClick={() => setShowBreakdown(current => !current)}>Rating breakdown{showBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>} />
    {showBreakdown ? <div id="rating-breakdown" className={styles.expandedBreakdown}><RatingBreakdown /></div> : null}
    {loadError ? <p role="status" className={styles.ratingCaption}>{loadError} <button type="button" onClick={() => void refresh()}>Retry</button></p> : null}
    {summary?.reviews.length ? <div className={`${styles.testimonialGrid} ${styles.featuredReviews}`}>{summary.reviews.map(review => <ReviewCard key={review.review_id} review={review} onPin={() => void pin(review)} />)}</div> : null}
    {pinError ? <p role="status" className={styles.ratingCaption}>{pinError}</p> : null}
    {showAll ? <AllRatingsModal close={() => { setShowAll(false); requestAnimationFrame(() => trigger.current?.focus()); }} /> : null}
  </section>;
}

export default function ServiceRating() {
  const { summary, setSummary, headers, refresh, loadError } = useRatings();
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [testimonial, setTestimonial] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!summary || initialized.current) return;
    initialized.current = true;
    setSelected(summary.mine ?? 0); setDisplayName(summary.displayName); setTestimonial(summary.testimonial); setPublishConsent(Boolean(summary.testimonial || summary.displayName));
  }, [summary]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ score: selected, displayName, testimonial, publishConsent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSummary(data); setMessage("Thanks! Your rating has been saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your rating. Please try again."); }
    finally { setBusy(false); }
  }
  const preview = hover ?? selected;
  const needsConsent = Boolean(testimonial.trim() || displayName.trim());
  return <section id="rate-service" className={styles.serviceRating} aria-labelledby="service-rating-title">
    <div><p className={styles.eyebrow}>HOW ARE WE DOING?</p><h2 id="service-rating-title">Rate EOD-HUB’s listing service.</h2><p>How was your experience finding rentals and connecting with owners through EOD-HUB?</p><p>One rating per browser. You can update yours anytime.</p></div>
    <div className={styles.ratingControl}>
      <div className={styles.bombs} onMouseLeave={() => setHover(null)} role="group" aria-label="Your rating of EOD-HUB’s listing service">
        {Array.from({ length: 5 }, (_, index) => <span key={index} className={styles.bombSlot}><Bomb className={styles.bombEmpty} aria-hidden="true" size={36} /><span className={styles.bombFill} style={{ width: `${Math.max(0, Math.min(1, preview - index)) * 100}%` }}><Bomb size={36} aria-hidden="true" fill="currentColor" /></span>{[0.5, 1].map((half, part) => <button key={half} type="button" className={part ? styles.bombRight : styles.bombLeft} disabled={!summary || busy} aria-label={`Rate ${index + half} out of 5 bombs`} aria-pressed={selected === index + half} onMouseEnter={() => setHover(index + half)} onFocus={() => setHover(index + half)} onBlur={() => setHover(null)} onClick={() => setSelected(index + half)} />)}</span>)}
      </div>
      <span className={styles.ratingCaption}>{preview ? `${preview} / 5 bombs` : "Choose your rating"} · Half bombs welcome</span>
      <label>Public display name (optional)<input value={displayName} maxLength={60} onChange={event => setDisplayName(event.target.value)} placeholder="Community member" /></label>
      <label>Your experience with EOD-HUB (optional)<textarea value={testimonial} maxLength={1200} onChange={event => setTestimonial(event.target.value)} placeholder="Share your experience using our listing service…" /></label>
      {needsConsent ? <label className={styles.publishConsent}><input type="checkbox" checked={publishConsent} onChange={event => setPublishConsent(event.target.checked)} />Publish my testimonial and display name on this page. Please leave out personal contact information.</label> : null}
      <button type="button" className={styles.primaryButton} disabled={!summary || !selected || busy || (needsConsent && !publishConsent)} onClick={() => void save()}>{busy ? "Saving…" : summary?.mine ? "Update your rating" : "Submit rating"}</button>
      {!summary && loadError ? <button type="button" onClick={() => void refresh()}>Retry loading ratings</button> : null}
      <span role="status" aria-live="polite" className={styles.ratingCaption}>{message || loadError}</span>
    </div>
  </section>;
}
