# Rental map and NAVSCOLEOD proximity

List remains the default public Rentals view. Map adds a lazy-loaded Leaflet
street map above the existing cards, with the same search, state, owner, rent,
availability and date filters. Select a price pin to show its listings below;
select it again to clear. Selection carries into List with a dedicated clear
button. Units sharing a geocoded location share one pin and retain independent
cards, prices, contact modes and availability.

Map includes bottom-right +/− controls, mouse/touch drag, pinch zoom, keyboard
navigation, Fit rentals and a NAVSCOLEOD shortcut. Normal wheel scrolling remains
page scrolling. ResizeObserver retains the map center when rotating a phone.
Quarter-step zoom fitting avoids label overlap on narrow screens. Light/dark
styles follow ThemeProvider; the native-app web-only Rentals gate is unchanged.

NAVSCOLEOD uses the supplied coordinates 30.500402450561523, -86.37395477294922
and address **8840 Range Rd, Niceville, FL 32578**, also confirmed by the Navy's
[official contact page](https://www.netc.navy.mil/Commands/Center-for-Explosive-Ordnance-Disposal-and-Diving/Naval-School-Explosive-Ordnance-Disposal/Contact-Us/).
Eglin-area cards and photo-gallery details show the school address, approximate
Haversine straight-line miles and a per-property driving-directions link. No
driving mileage, travel time or installation-access guarantee is inferred.
School-name searches also find the nearby Eglin inventory.

Existing addresses were checked with the
[Census Geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html),
Public_AR_Current, on 2026-10-30. Coordinates are calculated street-range
locations, not surveyed entrances or individual-unit locations. The owner
confirmed Unit 139 is **4276 Calinda Lane**; its historical listing ID remains
unchanged to preserve availability records. Known address seeds are bound to
street/city/state/ZIP, not to listing IDs, so address edits cannot reuse an old
coordinate accidentally.

New already-public/approved/paid inventory can receive an address location from
the Census service. Accept only a unique result matching street, state and ZIP;
cache geometry per address for one day, never inventory eligibility or contacts.
Four workers, a bounded time budget and per-request timeouts prevent an outage
from hiding rentals. Unresolved locations remain in List without invented pins
or distances. A large first-time inventory may need subsequent requests to finish
warming the coordinate cache. No database schema or approval/billing changes.

Tiles load directly from OpenStreetMap only while Map is open. Browser caching
and the existing valid Referer policy are retained; attribution stays visible.
No bulk download, offline cache, geolocation permission or paid map account.
The public tile service is best-effort; if its capacity becomes insufficient,
switch the tile-layer configuration to an appropriate hosted provider. List and
contact details continue to work without tiles. See the
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
Leaflet is pinned to 1.9.4 with pinned types and lockfile entries.

References: [Leaflet API](https://leafletjs.com/reference.html),
[Google Maps URL directions](https://developers.google.com/maps/documentation/urls/get-started).

Validation: rental-map tests cover address seeds, unit grouping, strict Census
matching, missing/invalid data, distances, school searches and direction URLs.
Existing directory checks cover availability, contacts, public/private routes
and the 50-state selector. Browser checks use actual components with full global
styles, real desktop mouse clicks, portrait/landscape/narrow phone viewports,
shared selection, filters, school popup and listing details. Physical devices
and touch gestures require a device check.
