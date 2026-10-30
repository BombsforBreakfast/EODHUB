"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { availabilityLabel, type RentalListing } from "@/app/lib/rentals/catalog";
import { isEglinRental, NAVSCOLEOD, rentalDirections, rentalMapGroups } from "@/app/lib/rentals/locations";
import { useTheme } from "@/app/lib/ThemeContext";
import styles from "./RentalMapView.module.css";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

export default function RentalMapView({ listings, selectedIds, onSelect, onClear }: {
  listings: RentalListing[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClear: () => void;
}) {
  const { isDark } = useTheme();
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const fit = useRef(() => {});
  const buttons = useRef<{ ids: string[]; button: HTMLButtonElement }[]>([]);
  const [tileError, setTileError] = useState(false);
  const groups = useMemo(() => rentalMapGroups(listings), [listings]);
  const schoolVisible = listings.some(isEglinRental);
  const mappedCount = groups.reduce((count, group) => count + group.listings.length, 0);

  useEffect(() => {
    if (!canvas.current) return;
    const instance = L.map(canvas.current, { zoomControl: false, scrollWheelZoom: false, zoomSnap: .25, minZoom: 2, maxZoom: 18 }).setView([38.5, -98], 4);
    map.current = instance;
    layers.current = L.layerGroup().addTo(instance);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      className: styles.tiles,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    tiles.on("load", () => setTileError(false));
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: true, animate: false }));
    observer.observe(canvas.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; layers.current = null; buttons.current = []; };
  }, []);

  useEffect(() => {
    const instance = map.current, layer = layers.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    buttons.current = [];
    const points: L.LatLngTuple[] = [];
    for (const group of groups) {
      const ids = group.listings.map(listing => listing.id);
      const listing = group.listings[0];
      const period = listing.rentPeriod === "night" ? "night" : listing.rentPeriod === "week" ? "wk" : "mo";
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.pin;
      button.dataset.rentalMapMarker = group.key;
      button.dataset.availability = group.listings.every(item => item.availability.status === "pending") ? "pending" : group.listings.every(item => item.availability.status === "unavailable") ? "unavailable" : "available";
      button.textContent = ids.length > 1 ? `${ids.length} rentals` : `${money(listing.monthlyRent)}/${period}`;
      button.setAttribute("aria-label", ids.length > 1 ? `Select ${ids.length} rentals near ${listing.address}, ${listing.city}` : `Select ${listing.address}, ${money(listing.monthlyRent)} per ${listing.rentPeriod ?? "month"}, ${availabilityLabel(listing.availability)}`);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", event => { event.stopPropagation(); onSelect(ids); });
      L.DomEvent.disableClickPropagation(button);
      buttons.current.push({ ids, button });
      L.marker([group.latitude, group.longitude], { keyboard: false, icon: L.divIcon({ html: button, className: styles.markerShell, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(layer);
      points.push([group.latitude, group.longitude]);
    }
    if (schoolVisible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${styles.pin} ${styles.schoolPin}`;
      button.textContent = "★ NAVSCOLEOD";
      button.setAttribute("aria-label", `Show NAVSCOLEOD, ${NAVSCOLEOD.address}`);
      const content = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = NAVSCOLEOD.fullName;
      const address = document.createElement("p"); address.textContent = NAVSCOLEOD.address;
      const directions = document.createElement("a"); directions.textContent = "Open driving directions"; directions.href = rentalDirections(); directions.target = "_blank"; directions.rel = "noopener noreferrer";
      content.append(title, address, directions);
      const marker = L.marker([NAVSCOLEOD.latitude, NAVSCOLEOD.longitude], { keyboard: false, icon: L.divIcon({ html: button, className: styles.markerShell, iconSize: [0, 0], iconAnchor: [0, 0] }) }).bindPopup(content).addTo(layer);
      button.addEventListener("click", event => { event.stopPropagation(); marker.openPopup(); });
      L.DomEvent.disableClickPropagation(button);
      points.push([NAVSCOLEOD.latitude, NAVSCOLEOD.longitude]);
    }
    fit.current = () => {
      instance.closePopup();
      if (points.length) instance.fitBounds(L.latLngBounds(points), { paddingTopLeft: [50, 65], paddingBottomRight: [75, 65], maxZoom: 14, animate: false });
      else instance.setView([38.5, -98], 4, { animate: false });
    };
    fit.current();
  }, [groups, schoolVisible, onSelect]);

  useEffect(() => {
    const selected = new Set(selectedIds);
    for (const { ids, button } of buttons.current) button.setAttribute("aria-pressed", String(ids.some(id => selected.has(id))));
  }, [selectedIds, groups, schoolVisible]);

  return <section className={styles.panel} data-dark={isDark} aria-label="Rental map">
    <div className={styles.heading}><div><h2>Find your place on the map</h2><p>{mappedCount} of {listings.length} rentals mapped</p></div>
      <div className={styles.tools}><button type="button" onClick={() => fit.current()}>Fit rentals</button>{schoolVisible ? <button type="button" onClick={() => map.current?.setView([NAVSCOLEOD.latitude, NAVSCOLEOD.longitude], 14)}>NAVSCOLEOD</button> : null}</div>
    </div>
    <div className={styles.mapFrame}>
      <div ref={canvas} className={styles.canvas} aria-label="Interactive property map. Select a rental price pin to show its listings below." />
      <div className={styles.zoom} role="group" aria-label="Rental map zoom"><button type="button" aria-label="Zoom rental map in" onClick={() => map.current?.zoomIn()}>+</button><button type="button" aria-label="Zoom rental map out" onClick={() => map.current?.zoomOut()}>−</button></div>
    </div>
    <div className={styles.selection}><p role="status">{selectedIds.length ? `${selectedIds.length} ${selectedIds.length === 1 ? "rental selected" : "rentals selected"} · See the listing details below` : "Select a price pin to show its rentals below. Select it again to clear."}</p>{selectedIds.length ? <button type="button" onClick={onClear}>Show all matching rentals</button> : null}</div>
    {schoolVisible ? <p className={styles.schoolAddress}><strong>★ NAVSCOLEOD</strong> · {NAVSCOLEOD.address}</p> : null}
    {mappedCount < listings.length ? <p className={styles.note}>{listings.length - mappedCount} {listings.length - mappedCount === 1 ? "rental has" : "rentals have"} an unverified map location.{selectedIds.length ? " Clear the map selection to include them below." : " They remain available in the listings below."}</p> : null}
    {tileError ? <p className={styles.note} role="status">Some map tiles could not load. Rental pins and listing details remain available.</p> : null}
    <p className={styles.note}>Map pins are approximate street locations. School distances are straight-line estimates; check driving directions for your route and installation access. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map issue</a>.</p>
  </section>;
}
