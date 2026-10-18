"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PROMOTION_IMAGE_LIMIT, PROMOTION_MAX_IMAGES, PROMOTION_TYPES, promotionInput, type PROMOTION_PACKAGES } from "@/app/lib/promotions";
import CopyPromotionEmail from "../CopyPromotionEmail";
import styles from "../promote.module.css";

type PickedImage = { id: string; file: File };
function ImagePreview({ file }: { file: File }) {
  const preview = useRef<HTMLImageElement>(null);
  useEffect(() => { const next = URL.createObjectURL(file); if (preview.current) preview.current.src = next; return () => URL.revokeObjectURL(next); }, [file]);
  // User-selected blob previews never go through a remote image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={preview} alt={file.name} width={180} height={130} style={{ objectFit: "contain", width: "100%", height: 130 }} />;
}
async function responseJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Something interrupted your submission. Please try again.");
  return result;
}
export default function PromotionWizard({ selectedPackage }: { selectedPackage: typeof PROMOTION_PACKAGES[number] }) {
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState({ name: "", email: "", phone: "", business: "", promotionType: PROMOTION_TYPES[0] as string, description: "", destination: "", timing: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const uploaded = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, complete]);
  const change = (key: keyof typeof fields, value: string) => setFields(previous => ({ ...previous, [key]: value }));
  function nextStep(form: HTMLFormElement) {
    if (!form.reportValidity()) return;
    setError(""); setStep(previous => previous + 1);
  }
  function addImages(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files);
    if (images.length + next.length > PROMOTION_MAX_IMAGES) { setError("Choose up to five images in total."); return; }
    for (const file of next) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError(`${file.name}: please choose a JPG, PNG or WebP image.`); return; }
      if (file.size > PROMOTION_IMAGE_LIMIT || file.size === 0) { setError(`${file.name}: images must be between 1 byte and 3 MB. Resize the image and try again.`); return; }
    }
    setImages(previous => [...previous, ...next.map(file => ({ file, id: crypto.randomUUID() }))]); setError("");
  }
  async function submit() {
    setError("");
    const id = draftId ?? crypto.randomUUID();
    const input = promotionInput.safeParse({ ...fields, id, package: selectedPackage, consent });
    if (!input.success) { setError(input.error.issues[0]?.message ?? "Please check your details."); return; }
    setDraftId(id); setBusy(true);
    try {
      setProgress("Saving your request…");
      // Silently establish/reuse a private draft session; no member login is needed.
      await responseJson(await fetch("/promote/api/session", { method: "POST" }));
      await responseJson(await fetch("/promote/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) }));
      for (let index = 0; index < images.length; index++) {
        const image = images[index];
        if (uploaded.current.has(image.id)) continue;
        setProgress(`Uploading image ${index + 1} of ${images.length}…`);
        await responseJson(await fetch(`/promote/api/requests/${id}/images`, { method: "POST", headers: { "Content-Type": image.file.type, "X-Upload-Id": image.id, "X-File-Name": image.file.name.replace(/[^a-zA-Z0-9 ._()-]/g, "_") }, body: image.file }));
        uploaded.current.add(image.id);
      }
      setProgress("Sending to the EOD-HUB review desk…");
      await responseJson(await fetch(`/promote/api/requests/${id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageCount: images.length }) }));
      setComplete(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); setProgress(""); }
  }
  if (complete) return <section className={styles.wizardCard}>
    <p className={styles.eyebrow}>REQUEST RECEIVED</p><h1 ref={heading} tabIndex={-1}>You’re on our review desk.</h1>
    <p>Your <strong>{selectedPackage}</strong> request and {images.length} image{images.length === 1 ? "" : "s"} are saved. We’ll review the material and follow up at <strong>{fields.email}</strong> to coordinate the details.</p>
    <p>You haven’t been charged. We’ll confirm the work with you before sending a Square invoice.</p>
    <p>Reference: <strong>{draftId?.slice(0,8).toUpperCase()}</strong></p>
    <Link className={styles.secondaryButton} href="/promote">Back to promotion packages</Link><CopyPromotionEmail className={styles.footerContact} showHint />
  </section>;
  return <section className={styles.wizardCard}>
    <Link href="/promote">← Promotion packages</Link>
    <p className={styles.eyebrow}>{selectedPackage.toUpperCase()} PACKAGE · STEP {step} OF 3</p>
    <h1 ref={heading} tabIndex={-1}>{step === 1 ? "Who are we working with?" : step === 2 ? "Tell us what you have in mind." : "Review your request."}</h1>
    <p>Package interest: <strong>{selectedPackage}</strong>. We’ll agree on the final scope before invoicing.</p>
    <form onSubmit={event => { event.preventDefault(); if (step < 3) nextStep(event.currentTarget); else void submit(); }}>
      {step === 1 ? <fieldset disabled={busy || Boolean(draftId)} className={styles.wizardFields}>
        <label>Your name<input required minLength={2} maxLength={120} autoComplete="name" value={fields.name} onChange={e => change("name", e.target.value)} /></label>
        <label>Email address<input required type="email" maxLength={254} autoComplete="email" value={fields.email} onChange={e => change("email", e.target.value)} /></label>
        <label>Phone number <span>(optional)</span><input type="tel" minLength={7} maxLength={40} autoComplete="tel" value={fields.phone} onChange={e => change("phone", e.target.value)} /></label>
        <label>Business name <span>(optional)</span><input maxLength={160} autoComplete="organization" value={fields.business} onChange={e => change("business", e.target.value)} /></label>
        <label>Type of promotion<select value={fields.promotionType} onChange={e => change("promotionType", e.target.value)}>{PROMOTION_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className={styles.honeypot} aria-hidden="true">Website confirmation<input tabIndex={-1} autoComplete="off" value={fields.website} onChange={e => change("website", e.target.value)} /></label>
      </fieldset> : null}
      {step === 2 ? <fieldset disabled={busy || Boolean(draftId)} className={styles.wizardFields}>
        <label>What would you like to promote?<textarea required minLength={20} maxLength={12000} rows={9} value={fields.description} onChange={e => change("description", e.target.value)} placeholder="Tell us about the offer, audience, wording, dates, locations, links, and anything else we should know." /><small>{fields.description.length.toLocaleString()} / 12,000 characters</small></label>
        <label>Destination link <span>(optional)</span><input type="url" maxLength={2000} value={fields.destination} onChange={e => change("destination", e.target.value)} placeholder="https://" /></label>
        <label>Preferred timing <span>(optional)</span><textarea rows={2} maxLength={500} value={fields.timing} onChange={e => change("timing", e.target.value)} /></label>
        <label>Photos, logos or flyers <span>(optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { addImages(e.target.files); e.target.value = ""; }} /><small>Up to five still images, 3 MB each. JPG, PNG or WebP. We resize images for review and remove embedded location metadata.</small></label>
        <div className={styles.imageGrid}>{images.map(image => <div key={image.id}><ImagePreview file={image.file} /><p>{image.file.name}</p><button type="button" onClick={() => setImages(previous => previous.filter(item => item.id !== image.id))}>Remove {image.file.name}</button></div>)}</div>
      </fieldset> : null}
      {step === 3 ? <>
        <dl className={styles.requestSummary}><dt>Package</dt><dd>{selectedPackage}</dd><dt>Contact</dt><dd>{fields.name}<br />{fields.email}{fields.phone ? <><br />{fields.phone}</> : null}{fields.business ? <><br />{fields.business}</> : null}</dd><dt>Promotion type</dt><dd>{fields.promotionType}</dd><dt>Your brief</dt><dd>{fields.description}</dd>{fields.destination ? <><dt>Destination</dt><dd>{fields.destination}</dd></> : null}{fields.timing ? <><dt>Timing</dt><dd>{fields.timing}</dd></> : null}<dt>Images</dt><dd>{images.length} of 5{images.map(image => <div key={image.id}>{image.file.name}</div>)}</dd></dl>
        <label className={styles.consent}><input type="checkbox" required checked={consent} disabled={busy || Boolean(draftId)} onChange={e => setConsent(e.target.checked)} /><span>I have permission to share this material and understand this is a request for review. EOD-HUB may contact me about this promotion. Nothing is charged or published by submitting.</span></label>
      </> : null}
      {error ? <p role="alert" className={styles.wizardError}>{error}{error.includes("expired") ? <> Choose “Edit and start a fresh request” below. Your form details are kept.</> : null}</p> : null}
      {progress ? <p role="status" aria-live="polite">{progress}</p> : null}
      <div className={styles.wizardActions}>
        {step > 1 && !draftId ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setStep(previous => previous - 1); setError(""); }}>Back</button> : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Submitting…" : step < 3 ? "Continue" : draftId ? "Retry submission" : "Submit for review"}</button>
        {draftId && !busy ? <button type="button" className={styles.secondaryButton} onClick={() => { setDraftId(null); uploaded.current.clear(); setError(""); setStep(1); }}>Edit and start a fresh request</button> : null}
      </div>
    </form>
    <p className={styles.wizardHelp}>Questions? <CopyPromotionEmail className={styles.footerContact} /></p>
  </section>;
}
