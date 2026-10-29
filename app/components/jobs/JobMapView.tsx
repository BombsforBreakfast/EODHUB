"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../../lib/ThemeContext";
import geometry from "../../lib/jobMapGeometry.generated.json";
import { JOB_LOCATION_UNSPECIFIED, resolveRegionFilter, type JobListItem } from "../../lib/jobFilters";
import { buildJobMap, jobMapWorldRegion } from "../../lib/jobMap";
import styles from "./JobMapView.module.css";

export default function JobMapView({ jobs, selectedRegions, onChangeRegions, matchingCount }: {
  jobs: JobListItem[];
  selectedRegions: string[];
  onChangeRegions: (regions: string[]) => void;
  matchingCount: number;
}) {
  const { t, isDark } = useTheme();
  const summaryId = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 960, height: 600 });
  const inventory = useMemo(() => buildJobMap(jobs), [jobs]);
  const selected = new Set(selectedRegions.map(resolveRegionFilter));
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) setSize({ width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function toggle(key: string) {
    onChangeRegions(selected.has(key) ? [...selected].filter(region => region !== key) : [...selected, key]);
  }
  const scale = Math.min(size.width / 960, size.height / 600);
  const offsetX = (size.width - 960 * scale) / 2, offsetY = (size.height - 600 * scale) / 2;
  // Labels stay at readable screen sizes after rotation. Omit colliding labels;
  // every state remains a named keyboard/touch target and in Geography.
  const occupied: { x: number; y: number; width: number; height: number }[] = [];
  const labels = [...geometry.shapes].sort((a, b) => (inventory.buckets.get(b.code)?.count ?? 0) - (inventory.buckets.get(a.code)?.count ?? 0)).flatMap(shape => {
    const count = inventory.buckets.get(shape.code)?.count ?? 0;
    if (!count && scale * 960 < 700) return [];
    if (["DC", "RI", "DE", "NJ", "CT", "MA", "NH", "VT", "MD"].includes(shape.code)) return [];
    const x = offsetX + shape.center[0] * scale, y = offsetY + shape.center[1] * scale;
    const box = { x: x - 16, y: y - 12, width: 32, height: count ? 31 : 16 };
    if (occupied.some(other => box.x < other.x + other.width + 3 && box.x + box.width + 3 > other.x && box.y < other.y + other.height + 3 && box.y + box.height + 3 > other.y)) return [];
    occupied.push(box);
    return [{ ...shape, x, y, count }];
  });
  const palette = { empty: t.bg, filled: isDark ? "#294361" : "#c6d8f5", selected: isDark ? "#426c9c" : "#93b7e5" };
  const theme = { "--job-map-border": t.border, "--job-map-surface": t.surface, "--job-map-text": t.text, "--job-map-muted": t.textMuted } as CSSProperties;
  const locationButton = (key: string, label: string) => <button key={key} type="button" className={styles.button} aria-pressed={selected.has(key)} onClick={() => toggle(key)}>{label} · {inventory.buckets.get(key)?.count ?? 0}</button>;
  return <section aria-label="Jobs map" className={styles.panel} style={theme}>
    <div className={styles.heading}>
      <h2>Jobs by location</h2>
      {selected.size > 0 && <button type="button" className={styles.button} onClick={() => onChangeRegions([])}>Clear map locations</button>}
    </div>
    <p id={summaryId} className={styles.summary}>{inventory.us} U.S. · {inventory.overseas} overseas · {inventory.unspecified} {inventory.unspecified === 1 ? "lacks" : "lack"} location detail</p>
    <div ref={canvas} className={styles.canvas}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="U.S. states, DC and Puerto Rico" aria-describedby={summaryId}>
        <g transform={`translate(${offsetX},${offsetY}) scale(${scale})`}>
          {geometry.shapes.map(shape => {
            const bucket = inventory.buckets.get(shape.code);
            const count = bucket?.count ?? 0;
            const label = `${shape.name}: ${count} ${count === 1 ? "job" : "jobs"}${bucket?.locations.length ? ` · ${bucket.locations.join("; ")}` : ""}`;
            return <path key={shape.code} d={shape.path} className={styles.state} fill={selected.has(shape.code) ? palette.selected : bucket?.count ? palette.filled : palette.empty} role="button" tabIndex={0} aria-label={label} aria-pressed={selected.has(shape.code)} onClick={() => toggle(shape.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(shape.code); } }}><title>{label}</title></path>;
          })}
        </g>
        <g aria-hidden="true" pointerEvents="none" fill={t.text} fontSize={12} textAnchor="middle">
          {labels.map(label => <g key={label.code}><text x={label.x} y={label.y}>{label.code}</text>{label.count > 0 && <text x={label.x} y={label.y + 13} fontWeight={700}>{label.count}</text>}</g>)}
        </g>
      </svg>
    </div>
    <div className={styles.locations}>{locationButton("DC", "District of Columbia")}{locationButton("PR", "Puerto Rico")}{locationButton(JOB_LOCATION_UNSPECIFIED, "Lacks location detail")}</div>
    <p className={styles.hint}>Select states or countries to combine locations. Counts use the other filters; {matchingCount} matching {matchingCount === 1 ? "job appears" : "jobs appear"} below. Multiple-location listings can appear in more than one count.</p>
    {inventory.countries.length > 0 && <div className={styles.overseas}>
      <h3>Beyond the United States</h3>
      <div className={styles.countries}>{inventory.countries.map(country => <button key={country.key} type="button" className={`${styles.button} ${styles.country}`} aria-pressed={selected.has(country.key)} onClick={() => toggle(country.key)}><span>{country.label}<small>{jobMapWorldRegion(country.key)}{country.locations.length ? ` · ${country.locations.join("; ")}` : ""}</small></span><strong>{country.count}</strong></button>)}</div>
    </div>}
  </section>;
}
