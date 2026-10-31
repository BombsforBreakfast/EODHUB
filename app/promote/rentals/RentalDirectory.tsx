"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bath, BedDouble, Check, ChevronLeft, ChevronRight, Copy, House, Images, List, Mail, Map as MapIcon, MapPin, Phone, Search, Sofa, Users, Waves, X } from "lucide-react";
import { availabilityLabel, getRentalManagement, rentalMatches, rentalStates, type RentalListing, type RentalManagementContact, type RentalOwner } from "@/app/lib/rentals/catalog";
import { writeClipboardText } from "@/app/lib/native/nativeClipboard";
import styles from "./rentals.module.css";
import ServiceRating, { ServiceRatingProvider, ServiceRatingSummary } from "./ServiceRating";
import { useTheme } from "@/app/lib/ThemeContext";
import RentalSchoolProximity from "./RentalSchoolProximity";
import RentalHomeBuyingAd from "./RentalHomeBuyingAd";
import RentalFlagDialog from "./RentalFlagDialog";
import { recordRentalEngagement } from "@/app/lib/rentals/analytics.client";

const RentalMapView = dynamic(() => import("./RentalMapView"), { ssr: false, loading: () => <p role="status">Loading rental map…</p> });

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

function CopyRentalEmail({ email, label, className = styles.copyEmail, propertyId }: { email: string; label?: string; className?: string; propertyId?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  async function copy() {
    if (timeout.current) clearTimeout(timeout.current);
    try {
      await writeClipboardText(email, "Rental contact email");
      if (propertyId) recordRentalEngagement("property", propertyId, "email_copy");
      setStatus("copied");
      timeout.current = setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("failed");
    }
  }
  return <div className={styles.copyControl}>
    <button type="button" className={className} onClick={() => void copy()} aria-label={`Copy email address ${email}`} title="Copy email address">
      {status === "copied" ? <Check size={16} /> : <Copy size={16} />}<span>{label ?? email}</span>
    </button>
    {label ? <span className={styles.emailAddress}>{email}</span> : null}
    <span role="status" aria-live="polite" className={styles.copyStatus}>{status === "copied" ? "Email address copied." : status === "failed" ? "Clipboard access is blocked. Select the address below to copy it." : ""}</span>
    {status === "failed" ? <input className={styles.manualEmail} aria-label={`Email address for manual copy: ${email}`} value={email} readOnly onFocus={event => event.currentTarget.select()} /> : null}
  </div>;
}

function RentalApplicationLink({ management, propertyId }: { management: RentalManagementContact; propertyId: string }) {
  const record = () => recordRentalEngagement("property", propertyId, "application_click");
  return <a className={styles.applicationLink} href={management.applicationUrl} target="_blank" rel="noopener noreferrer" onClick={record} onAuxClick={e => { if (e.button === 1) record(); }} aria-label={`Open ${management.company} rental application in a new tab`}>Rental application <ArrowUpRight size={16} /></a>;
}

function RentalPhoto({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={styles.photoFallback}><House size={36} /><span>Photo unavailable · contact the owner for more</span></div>;
  return <Image src={src} alt={alt} fill unoptimized draggable={false} priority={priority} sizes="(max-width: 700px) 100vw, 50vw" onError={() => setFailed(true)} className={styles.photo} />;
}

function RentalGallery({ listing, owner, close, ask }: { listing: RentalListing; owner: RentalOwner; close: () => void; ask: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const move = (amount: number) => setPhotoIndex(current => (current + amount + listing.photos.length) % listing.photos.length);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return <dialog ref={dialog} className={styles.dialog} onClose={close} aria-labelledby="rental-gallery-title"
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); move(1); } }}>
    <div className={styles.dialogContent}>
      <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>{listing.city}, {listing.state}</p><h2 id="rental-gallery-title">{listing.address}</h2></div>
        <button className={styles.iconButton} type="button" onClick={() => dialog.current?.close()} aria-label="Close photo gallery"><X /></button>
      </header>
      <div className={styles.galleryImage}>
        <RentalPhoto key={listing.photos[photoIndex]} src={listing.photos[photoIndex]} alt={`${listing.address}, property photo ${photoIndex + 1} of ${listing.photos.length}`} />
        {listing.photos.length > 1 ? <><button type="button" className={`${styles.galleryPrevious} ${styles.iconButton}`} onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft /></button><button type="button" className={`${styles.galleryNext} ${styles.iconButton}`} onClick={() => move(1)} aria-label="Next photo"><ChevronRight /></button></> : null}
        <span className={styles.photoCounter} aria-live="polite">{photoIndex + 1} / {listing.photos.length}</span>
      </div>
      <div className={styles.thumbnails} aria-label="Choose a property photo">{listing.photos.map((photo, index) => <button type="button" key={photo} aria-label={`View photo ${index + 1}`} aria-pressed={index === photoIndex} className={index === photoIndex ? styles.selectedThumbnail : ""} onClick={() => setPhotoIndex(index)}><Image src={photo} alt="" fill unoptimized draggable={false} sizes="88px" loading="lazy" /></button>)}</div>
      <RentalSchoolProximity listing={listing} />
      <div className={styles.galleryFooter}><p>Contact the owner for current property details.</p><button type="button" className={styles.primaryButton} onClick={ask}>Ask {owner.name.split(" ")[0]} about this home <ArrowRight size={17} /></button></div>
    </div>
  </dialog>;
}

function RentalContactModal({ listing, owner: originalOwner, close }: { listing: RentalListing; owner: RentalOwner; close: () => void }) {
  const owner = listing.providerContact ? { ...originalOwner, name: listing.providerContact.name, email: listing.providerContact.email } : originalOwner;
  const dialog = useRef<HTMLDialogElement>(null);
  const management = getRentalManagement(listing, owner);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.contactDialog}`} onClose={close} aria-labelledby="rental-contact-title" aria-describedby="rental-contact-description"
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className={styles.dialogContent}>
      <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>RENTAL INQUIRY · {listing.city}, {listing.state}</p><h2 id="rental-contact-title">{listing.address}</h2></div>
        <button className={styles.iconButton} type="button" onClick={() => dialog.current?.close()} aria-label="Close rental contacts"><X /></button>
      </header>
      <p id="rental-contact-description" className={styles.contactDescription}>Ask about availability, move-in dates, and rental terms. Click an email address to copy it.</p>
      <div className={styles.ownerCard}>
        <div className={styles.ownerName}><span aria-hidden="true">{owner.name.split(" ").map(part => part[0]).join("")}</span><div><h3>{owner.name}</h3><p>{listing.portalListing ? "Rental provider" : "Rental owner"} · {listing.city}, {listing.state}</p></div></div>
        <CopyRentalEmail email={owner.email} propertyId={listing.id} />
        {listing.providerContact ? <><p>{listing.providerContact.company}</p><a className={styles.managerPhone} onClick={() => recordRentalEngagement("property", listing.id, "phone_click")} href={`tel:${listing.providerContact.phone.replace(/[^+\d]/g, "")}`}><Phone size={17} />{listing.providerContact.phone}</a></> : null}
        {management ? <div className={styles.managementContact}>
          <p className={styles.eyebrow}>PROPERTY MANAGEMENT</p>
          <h3>{management.company}</h3><p>Realtor: {management.realtor}</p>
          <a className={styles.managerPhone} onClick={() => recordRentalEngagement("property", listing.id, "phone_click")} href={`tel:${management.phoneHref}`}><Phone size={17} />{management.phone}</a>
          <CopyRentalEmail email={management.email} propertyId={listing.id} />
          <RentalApplicationLink management={management} propertyId={listing.id} />
          <small>For calls, contact {management.company}. Applications open on their website.</small>
        </div> : null}
      </div>
    </div>
  </dialog>;
}

export default function RentalDirectory({ listings, owners, showFilters = false, showStateFilter = false }: { listings: RentalListing[]; owners: RentalOwner[]; showFilters?: boolean; showStateFilter?: boolean }) {
  const { t, isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [availability, setAvailability] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [rentPeriod, setRentPeriod] = useState("");
  const [priceBasis, setPriceBasis] = useState("");
  const [availableBy, setAvailableBy] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [mapSelection, setMapSelection] = useState<string[]>([]);
  const [modal, setModal] = useState<{ kind: "gallery" | "contact" | "flag"; listingId: string } | null>(null);
  const modalTrigger = useRef<HTMLButtonElement | null>(null);
  const filtered = useMemo(() => listings.filter(listing => rentalMatches(listing, { query, state, availability, ownerId }, owners) &&
    (!rentPeriod || (listing.rentPeriod ?? "month") === rentPeriod) && (!priceBasis || (listing.priceBasis ?? "property") === priceBasis) &&
    (!maxRent || listing.monthlyRent <= Number(maxRent)) && (!availableBy || listing.availability.status === "available-now" || (listing.projectedAvailabilityDate && listing.projectedAvailabilityDate <= availableBy))), [listings, owners, query, state, availability, ownerId, rentPeriod, priceBasis, maxRent, availableBy]);
  const selectedMapIds = useMemo(() => mapSelection.filter(id => filtered.some(listing => listing.id === id)), [mapSelection, filtered]);
  const displayed = selectedMapIds.length ? filtered.filter(listing => selectedMapIds.includes(listing.id)) : filtered;
  const selectMapLocation = useCallback((ids: string[]) => setMapSelection(current => ids.every(id => current.includes(id)) ? [] : ids), []);
  const clearMapSelection = useCallback(() => setMapSelection([]), []);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .5) { const id = (entry.target as HTMLElement).dataset.rentalPropertyId; if (id) recordRentalEngagement("property", id, "impression"); observer.unobserve(entry.target); } }, { threshold: .5 });
    document.querySelectorAll<HTMLElement>("[data-rental-property-id]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  // Listing impression collection is independent of member authentication.
  }, [displayed]);
  const selectedListing = listings.find(listing => listing.id === modal?.listingId);
  const selectedOwner = owners.find(owner => owner.id === selectedListing?.ownerId);
  function openModal(kind: "gallery" | "contact" | "flag", listingId: string, trigger?: HTMLButtonElement) {
    if (kind !== "flag") recordRentalEngagement("property", listingId, kind === "contact" ? "contact_open" : "property_open");
    if (trigger) modalTrigger.current = trigger;
    setModal({ kind, listingId });
  }
  function closeModal(kind: "gallery" | "contact" | "flag") {
    setModal(current => current?.kind === kind ? null : current);
    requestAnimationFrame(() => modalTrigger.current?.focus());
  }
  function reset() { setQuery(""); setState(""); setAvailability(""); setOwnerId(""); setMaxRent(""); setRentPeriod(""); setPriceBasis(""); setAvailableBy(""); setMapSelection([]); }

  return <ServiceRatingProvider><div className={styles.page} data-rental-experience="public" style={{ "--ink": t.text, "--muted": t.textMuted, "--paper": t.bg, "--line": t.border, "--surface": t.surface, "--hover": t.surfaceHover, "--input": t.input, "--input-border": t.inputBorder, "--badge-bg": t.badgeBg, "--badge-text": t.badgeText, "--radius": `${t.radius}px`, "--radius-sm": `${t.radiusSm}px`, "--electric-green": isDark ? "#33ff66" : "#087e2a", "--green-surface": isDark ? "#020802" : "#effbf2", "--green-border": isDark ? "#33ff6670" : "#087e2a70", colorScheme: isDark ? "dark" : "light" } as CSSProperties}>
    <header className={styles.header}><Link href="/promote/rentals" className={styles.brand} aria-label="EOD-HUB Rentals home"><Image src="/branding/eod-crab-logo.png" width={40} height={40} alt="" /><span>EOD-HUB<span className={styles.brandSection}>RENTALS</span></span></Link>
      <nav aria-label="Rentals navigation"><a href="#rentals">Find a place</a><Link className={styles.hubLink} href="/promote/rentals/portal">Property portal <ArrowRight size={15} /></Link><Link className={styles.hubLink} href="/login">Member sign in <ArrowRight size={15} /></Link></nav>
    </header>
    <main>
      <ServiceRatingSummary />
      <section className={styles.hero} aria-labelledby="rentals-title">
        <div className={styles.heroCopy}><p className={styles.eyebrow}><span className={styles.liveDot} /> HOUSING FOR THE EOD COMMUNITY</p><h1 id="rentals-title">Your next assignment.<br /><span>Your next place.</span></h1>
          <p className={styles.heroDescription}>Less searching. More settling in. Find a place near your next chapter, and connect directly with the person who owns it.</p>
          <a href="#rentals" className={styles.primaryButton}>Explore the rentals <ArrowDown size={17} /></a>
          <div className={styles.heroDetails}><span><Mail size={17} /> Direct owner contact</span><span>No account needed</span></div>
        </div>
      </section>
      <div className={styles.locationStrip}><span>FIRST STOP</span><p>Niceville, Florida <span>—</span> Eglin AFB &amp; EOD school area</p><span>{listings.length} PLACES TO CALL HOME</span></div>
      <section id="rentals" className={styles.directory} aria-label="Rental listings">
        <div className={styles.viewToolbar}><div role="group" aria-label="Rental view" className={styles.viewToggle}>{(["list", "map"] as const).map(option => {
          const Icon = option === "list" ? List : MapIcon;
          return <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}><Icon size={16} aria-hidden="true" />{option === "list" ? "List" : "Map"}</button>;
        })}</div></div>
        {showFilters ? <div className={showStateFilter ? styles.filters : `${styles.filters} ${styles.filtersWithoutState}`}>
          <label className={styles.searchField}><span>Search rentals</span><div><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="City, ZIP, base, or feature" /></div></label>
          {showStateFilter ? <label><span>State</span><select value={state} onChange={event => setState(event.target.value)}><option value="">All 50 states</option>{rentalStates.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label> : null}
          <label><span>Availability</span><select value={availability} onChange={event => setAvailability(event.target.value)}><option value="">All availability</option><option value="available-now">Available now</option><option value="available-from">Upcoming availability</option><option value="pending">Pending</option><option value="unavailable">Not currently available</option></select></label>
          <label><span>Owner</span><select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">All owners</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
        </div> : null}
        {showFilters ? <div className={styles.extraFilters}><label><span>Maximum rent ($)</span><input type="number" min="1" value={maxRent} onChange={e => { setMaxRent(e.target.value); if (!rentPeriod && e.target.value) setRentPeriod("month"); }} placeholder="Any price" /></label><label><span>Pricing period</span><select value={rentPeriod} onChange={e => setRentPeriod(e.target.value)}><option value="">Any period</option><option value="month">Per month</option><option value="week">Per week</option><option value="night">Per night</option></select></label><label><span>Price covers</span><select value={priceBasis} onChange={e => setPriceBasis(e.target.value)}><option value="">Room or whole property</option><option value="property">Whole property</option><option value="room">Per room</option></select></label><label><span>Available by (optional)</span><input type="date" value={availableBy} onChange={e => setAvailableBy(e.target.value)} /></label></div> : null}
        <div className={styles.resultsLine}><p role="status" aria-live="polite">{displayed.length} {displayed.length === 1 ? "rental" : "rentals"}{selectedMapIds.length ? " at the selected map location" : state ? ` in ${rentalStates.find(([code]) => code === state)?.[1]}` : " to explore"}</p>{query || state || availability || ownerId || maxRent || rentPeriod || priceBasis || availableBy || selectedMapIds.length ? <button type="button" onClick={reset}>Clear filters <X size={13} /></button> : <span>Availability provided by the owner</span>}</div>
        {view === "list" && selectedMapIds.length ? <div className={styles.mapSelection}><span>A map location is selected.</span><button type="button" onClick={clearMapSelection}>Show all matching rentals</button></div> : null}
        {view === "map" ? <RentalMapView listings={filtered} selectedIds={selectedMapIds} onSelect={selectMapLocation} onClear={clearMapSelection} /> : null}
        <div className={styles.cardGrid}>{displayed.map(listing => {
          const owner = owners.find(item => item.id === listing.ownerId)!;
          return <article className={styles.card} key={listing.id} id={listing.id} data-provider-rental={listing.portalListing || undefined}>
            <button className={styles.cardPhoto} data-rental-property-id={listing.id} type="button" onClick={event => openModal("gallery", listing.id, event.currentTarget)} aria-label={`View ${listing.photos.length} photos of ${listing.address}`}><RentalPhoto src={listing.photos[0]} alt={listing.address} /><span className={styles.availability}><span className={listing.availability.status === "available-now" ? styles.liveDot : styles.neutralDot} />{availabilityLabel(listing.availability)}</span>{listing.availability.status === "pending" ? <span className={styles.pendingStamp} aria-hidden="true">PENDING</span> : null}<span className={styles.galleryBadge}><Images size={14} /> {listing.photos.length} photos</span></button>
            <div className={styles.cardBody}><div className={styles.cardTopLine}><span>{listing.propertyType} · {listing.city}, {listing.state}</span>{listing.furnished ? <Sofa size={17} aria-label="Fully furnished" /> : null}</div>
              <div className={styles.cardHeading}><h3>{listing.address}</h3><div className={styles.price}>{money(listing.monthlyRent)}<span>/ {listing.rentPeriod ?? "month"}{listing.priceBasis === "room" ? " per room" : ""}</span></div></div>
              {listing.projectedAvailabilityDate ? <p className={styles.updated}>Projected availability: <time dateTime={listing.projectedAvailabilityDate}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${listing.projectedAvailabilityDate}T00:00:00Z`))}</time></p> : null}
              <p className={styles.cardTitle}>{listing.title}</p>
              <div className={styles.propertyFacts}><span><BedDouble size={17} />{listing.bedrooms} {listing.bedrooms === 1 ? "bed" : "beds"}</span><span><Bath size={17} />{listing.bathrooms} {listing.bathrooms === 1 ? "bath" : "baths"}</span><span><Sofa size={16} />{listing.furnished ? "Furnished" : "Unfurnished"}</span></div>
              <RentalSchoolProximity listing={listing} />
              <div className={styles.tags}>{listing.highlights.map(highlight => <span key={highlight}>{highlight === "Pool" ? <Waves size={13} /> : null}{highlight}</span>)}</div>
              {listing.sharedRenters ? <div className={styles.roommateNote}><Users size={18} /><p><strong>Open to {listing.sharedRenters} individual renters</strong><span>About {money(listing.monthlyRent / listing.sharedRenters)} each with an equal split. Total rent is {money(listing.monthlyRent)}/month; confirm lease terms with Terry.</span></p></div> : null}
              <p className={styles.description}>{listing.description}</p>
              {listing.rentalTerms ? <details className={styles.rentalTerms}><summary>Lease, fees &amp; military flexibility</summary><p>Nine-month lease option. Owner acknowledges early termination for military-ordered relocation, including before nine months, with applicable notice requirements.</p><p>Minimum lease: {listing.rentalTerms.minimumLeaseMonths} months · Deposit: {money(listing.rentalTerms.deposit)}</p><p>Fees: {listing.rentalTerms.fees}</p><p>Included utilities: {listing.rentalTerms.utilities}</p><p>Pets: {listing.rentalTerms.petDetails}</p></details> : null}
              {listing.sourceNote ? <p className={styles.sourceNote}>{listing.sourceNote}</p> : null}
              <div className={styles.cardActions}><button type="button" className={styles.primaryButton} onClick={event => openModal("contact", listing.id, event.currentTarget)}>Ask about this rental <ArrowRight size={17} /></button></div>
              <p className={styles.updated}>Availability updated <time dateTime={listing.availabilityUpdatedAt}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${listing.availabilityUpdatedAt}T00:00:00Z`))}</time></p>
              <div className={styles.cardFooter}><button type="button" onClick={() => { reset(); setOwnerId(owner.id); document.getElementById("rentals")?.scrollIntoView({ behavior: "smooth" }); }}>{owner.name} · {listings.filter(item => item.ownerId === owner.id).length} rentals</button><button type="button" onClick={event => openModal("flag", listing.id, event.currentTarget)}>Flag listing</button></div>
            </div>
          </article>;
        })}</div>
        {!filtered.length ? <div className={styles.empty}><MapPin size={30} /><h3>No rentals here just yet.</h3><p>Our first three listings are in Niceville, Florida. Try another location or clear your filters to see them.</p><button type="button" className={styles.primaryButton} onClick={reset}>See all rentals <ArrowRight size={16} /></button></div> : null}
      </section>
      <RentalHomeBuyingAd />
      <ServiceRating />
      <section className={styles.advertise} aria-labelledby="rental-advertise-title">
        <div><p className={styles.eyebrow}>FOR PROPERTY OWNERS &amp; MANAGERS</p><h2 id="rental-advertise-title">Have a place to rent?</h2><p>Reach the EOD community for $10 monthly or $100 annually per property. Create your rental account, submit your properties, and pay only after approval.</p><Link className={styles.primaryButton} href="/promote/rentals/portal">List your property <ArrowRight size={17} /></Link></div>
        <CopyRentalEmail email="hello@eod-hub.com" />
      </section>
      <section className={styles.disclosure}><p className={styles.paidDisclosure}>These are paid listings. EOD-HUB does not sponsor, endorse, or recommend the listed properties, owners, or property managers.</p><p>Listings and rental terms are owner-provided advertising. Availability is not live booking inventory; confirm current availability and all terms with the owner. EOD-HUB introduces you to the owner and does not handle applications, deposits, or leases.</p><p>Availability information updated October 23, 2026. Contact the owner to confirm current pricing and availability.</p></section>
    </main>
    <div className={styles.footer}><Link href="/promote/rentals">EOD-HUB RENTALS</Link><p>Find your place. Stay connected.</p><Link href="/login">EOD-HUB member sign in <ArrowRight size={15} /></Link></div>
    {selectedListing && selectedOwner && modal ? modal.kind === "flag"
      ? <RentalFlagDialog key={`flag-${selectedListing.id}`} listing={selectedListing} close={() => closeModal("flag")} /> : modal.kind === "contact"
      ? <RentalContactModal key={`contact-${selectedListing.id}`} listing={selectedListing} owner={selectedOwner} close={() => closeModal("contact")} />
      : <RentalGallery key={`gallery-${selectedListing.id}`} listing={selectedListing} owner={selectedOwner} close={() => closeModal("gallery")} ask={() => openModal("contact", selectedListing.id)} /> : null}
  </div></ServiceRatingProvider>;
}
