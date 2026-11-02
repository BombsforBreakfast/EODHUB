"use client";

import { useState } from "react";
import { Clipboard, ExternalLink, Phone } from "lucide-react";
import type { PilotEvent } from "@/app/lib/ticketing/model";
import styles from "./ticketing.module.css";

export default function EventContact({ event }: { event: PilotEvent }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  if (!event.contact && !event.hostUrl && !event.venueAddress) return null;
  return <section className={styles.contactCard} aria-label="Event host and contact">
    <h2>Event host & contact</h2>
    {event.venueAddress ? <p>{event.venueAddress}</p> : null}
    {event.contact ? <><p><strong>{event.contact.name}</strong></p><div className={styles.buttonRow}><a className={styles.textButton} href={`tel:${event.contact.phone.replace(/[^+\d]/g, "")}`}><Phone size={16} />{event.contact.phone}</a><button className={styles.textButton} type="button" onClick={() => void navigator.clipboard.writeText(event.contact!.email).then(() => { setCopied(true); setError(""); }).catch(() => setError("Copy the email address manually."))}><Clipboard size={16} />{copied ? "Email copied" : event.contact.email}</button></div>{error ? <p className={styles.finePrint}>{error} {event.contact.email}</p> : null}</> : null}
    {event.hostUrl ? <a href={event.hostUrl} target="_blank" rel="noopener noreferrer" className={styles.secondary}>Original event / host website <ExternalLink size={16} /></a> : null}
  </section>;
}
