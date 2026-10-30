"use client";

import { useId, useMemo, type CSSProperties } from "react";
import { useTheme } from "../../lib/ThemeContext";
import geometry from "../../lib/jobMapGeometry.generated.json";
import { JOB_LOCATION_UNSPECIFIED, regionDisplayLabel, resolveRegionFilter, type JobListItem } from "../../lib/jobFilters";
import { buildJobMap, jobMapWorldRegion } from "../../lib/jobMap";
import styles from "./JobMapView.module.css";
import { focusJobMapBounds, INITIAL_JOB_MAP_CAMERA, jobMapShapeBounds, jobMapTransform, layoutJobMapLabels, MAX_JOB_MAP_ZOOM } from "../../lib/jobMapViewport";
import { useJobMapCamera } from "./useJobMapCamera";

const EAST_COAST = new Set(["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC"]);
const EAST_COAST_BOUNDS = jobMapShapeBounds(geometry.shapes.filter(shape => EAST_COAST.has(shape.code)).map(shape => shape.path));

export default function JobMapView({ jobs, selectedRegions, onChangeRegions, matchingCount }: {
  jobs: JobListItem[];
  selectedRegions: string[];
  onChangeRegions: (regions: string[]) => void;
  matchingCount: number;
}) {
  const { t, isDark } = useTheme();
  const summaryId = useId();
  const { canvas, size, camera, applyCamera, zoomBy, dragging, handlers } = useJobMapCamera();
  const inventory = useMemo(() => buildJobMap(jobs), [jobs]);
  const selected = new Set(selectedRegions.map(resolveRegionFilter));

  function toggle(key: string) {
    onChangeRegions(selected.has(key) ? [...selected].filter(region => region !== key) : [...selected, key]);
  }
  const transform = jobMapTransform(size, camera);
  const labels = layoutJobMapLabels(geometry.shapes.map(shape => ({ code: shape.code, count: inventory.buckets.get(shape.code)?.count ?? 0, x: transform.x + shape.center[0] * transform.scale, y: transform.y + shape.center[1] * transform.scale })), size);
  const palette = { empty: t.bg, filled: isDark ? "#294361" : "#c6d8f5", selected: t.text };
  const theme = { "--job-map-border": t.border, "--job-map-surface": t.surface, "--job-map-text": t.text, "--job-map-muted": t.textMuted } as CSSProperties;
  const locationButton = (key: string, label: string) => <button key={key} type="button" className={styles.button} aria-pressed={selected.has(key)} onClick={() => toggle(key)}>{label} · {inventory.buckets.get(key)?.count ?? 0}</button>;
  return <section aria-label="Jobs map" className={styles.panel} style={theme}>
    <div className={styles.heading}>
      <h2>Jobs by location</h2>
      {selected.size > 0 && <button type="button" className={styles.button} onClick={() => onChangeRegions([])}>Clear map locations</button>}
    </div>
    <p id={summaryId} className={styles.summary}>{inventory.us} U.S. · {inventory.overseas} overseas · {inventory.unspecified} {inventory.unspecified === 1 ? "lacks" : "lack"} location detail</p>
    <div className={styles.tools}>
      <button type="button" className={styles.button} onClick={() => applyCamera(focusJobMapBounds(EAST_COAST_BOUNDS, size))}>East Coast</button>
      <button type="button" className={styles.button} onClick={() => applyCamera(INITIAL_JOB_MAP_CAMERA)}>Reset view</button>
    </div>
    <div ref={canvas} className={styles.canvas} data-zoomed={camera.zoom > 1} data-dragging={dragging} style={{ touchAction: camera.zoom > 1 ? "none" : "pan-y" }} {...handlers}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="U.S. states, DC and Puerto Rico" aria-describedby={summaryId}>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {geometry.shapes.map(shape => {
            const bucket = inventory.buckets.get(shape.code);
            const count = bucket?.count ?? 0;
            const label = `${shape.name}: ${count} ${count === 1 ? "job" : "jobs"}${bucket?.locations.length ? ` · ${bucket.locations.join("; ")}` : ""}`;
            return <path key={shape.code} d={shape.path} className={styles.state} fill={selected.has(shape.code) ? palette.selected : bucket?.count ? palette.filled : palette.empty} role="button" tabIndex={count ? -1 : 0} aria-label={label} aria-pressed={selected.has(shape.code)} onClick={() => toggle(shape.code)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(shape.code); } }}><title>{label}</title></path>;
          })}
        </g>
        <g aria-hidden="true" pointerEvents="none" stroke={t.textMuted} strokeWidth={1} opacity={.7}>{labels.filter(label => Math.hypot(label.x - label.anchorX, label.y - label.anchorY) > 12).map(label => <line key={label.code} x1={label.anchorX} y1={label.anchorY} x2={label.x} y2={label.y} />)}</g>
      </svg>
      {labels.map(label => <button key={label.code} type="button" data-state-count={label.code} className={styles.marker} style={{ left: label.x, top: label.y, width: label.width, height: label.height }} aria-label={`${regionDisplayLabel(label.code)}: ${label.count} ${label.count === 1 ? "job" : "jobs"}`} aria-pressed={selected.has(label.code)} onClick={() => toggle(label.code)}><b>{label.code}</b> {label.count}</button>)}
      <div role="group" aria-label="Map zoom" data-map-zoom-controls className={styles.zoom}>
        <button type="button" className={styles.button} aria-label="Zoom in" disabled={camera.zoom >= MAX_JOB_MAP_ZOOM} onClick={() => zoomBy(1.5)}>+</button>
        <output aria-label="Map zoom level">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" className={styles.button} aria-label="Zoom out" disabled={camera.zoom <= 1} onClick={() => zoomBy(1 / 1.5)}>−</button>
      </div>
    </div>
    <p className={styles.selection} role="status">{selected.size ? `Selected: ${[...selected].map(regionDisplayLabel).join(", ")}` : "All locations"} · {matchingCount} matching {matchingCount === 1 ? "job" : "jobs"}</p>
    <div className={styles.locations}>{locationButton("DC", "District of Columbia")}{locationButton("PR", "Puerto Rico")}{locationButton(JOB_LOCATION_UNSPECIFIED, "Lacks location detail")}</div>
    <p className={styles.hint}>Tap a state or its count to select it; tap again to remove it. Use +/− or pinch to zoom, then drag to move the map. Counts reflect the other filters; multiple-location jobs can count in more than one state.</p>
    {inventory.countries.length > 0 && <div className={styles.overseas}>
      <h3>Beyond the United States</h3>
      <div className={styles.countries}>{inventory.countries.map(country => <button key={country.key} type="button" className={`${styles.button} ${styles.country}`} aria-pressed={selected.has(country.key)} onClick={() => toggle(country.key)}><span>{country.label}<small>{jobMapWorldRegion(country.key)}{country.locations.length ? ` · ${country.locations.join("; ")}` : ""}</small></span><strong>{country.count}</strong></button>)}</div>
    </div>}
  </section>;
}
