"use client";

import { useId, useState } from "react";
import { displayManualTime, parseManualTime } from "@/app/lib/ticketing/local-time";
import styles from "./ticketing.module.css";

/** Form-local editing preserves unfinished times in drafts. The native date
 * input stays uncontrolled so partial edits to its segments are not reset. */
export default function LocalDateTimeField({ label, name, defaultValue = "", onChange }: {
  label: string;
  name: string;
  defaultValue?: string;
  onChange: (value: string) => void;
}) {
  const hint = useId();
  const [date, setDate] = useState(() => defaultValue.split("T")[0]);
  const [time, setTime] = useState(() => displayManualTime(defaultValue.split("T")[1] ?? ""));
  function update(nextDate: string, nextTime: string) {
    setDate(nextDate); setTime(nextTime);
    onChange(nextDate || nextTime ? `${nextDate}T${parseManualTime(nextTime) ?? nextTime.trim()}` : "");
  }
  return <fieldset className={styles.dateTimeField}>
    <legend>{label}</legend>
    <div className={styles.dateTimeRow}>
      <label>Date<input type="date" name={`${name}Date`} required defaultValue={date} onInput={event => update(event.currentTarget.value, time)} /></label>
      <label>Time<input type="text" name={`${name}Time`} required value={time} placeholder="9:00 AM" autoComplete="off" maxLength={16} pattern={String.raw`\s*(?:(?:0?[1-9]|1[0-2])(?::[0-5][0-9])?\s*[AaPp][Mm]|(?:[01]?[0-9]|2[0-3])(?::[0-5][0-9])?)\s*`} title="Enter a time such as 9:00 AM or 14:30." aria-describedby={hint} onChange={event => update(date, event.target.value)} onBlur={event => { const parsed = parseManualTime(event.target.value); if (parsed) setTime(displayManualTime(parsed)); }} onInvalid={event => event.currentTarget.setCustomValidity("Enter a time such as 9:00 AM or 14:30.")} onInput={event => event.currentTarget.setCustomValidity("")} /></label>
    </div>
    <small id={hint} className={styles.finePrint}>Type a time, such as 9:00 AM or 14:30.</small>
  </fieldset>;
}
