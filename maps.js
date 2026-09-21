let loader;
export const HAS_KEY = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export function loadMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve(window.google.maps);
  if (!HAS_KEY) return Promise.reject(new Error('no-key'));
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&loading=async&v=weekly`;
    s.async = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = () => reject(new Error('maps-load-failed'));
    document.head.appendChild(s);
  });
  return loader;
}

export function haversine(a, b) {
  const R = 6371000, r = x => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(address, bias) {
  try {
    await loadMaps();
    const { Geocoder } = await window.google.maps.importLibrary('geocoding');
    const req = { address, region: 'ZA', componentRestrictions: { country: 'ZA' } };
    if (bias) { const d = 0.03; req.bounds = { south: bias.lat - d, north: bias.lat + d, west: bias.lng - d, east: bias.lng + d }; }
    const res = await new Geocoder().geocode(req);
    const r = res.results && res.results[0];
    if (!r) return null;
    return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), partial: !!r.partial_match };
  } catch (e) {
    return null;
  }
}

// Somerset West town centre, only used if Google cannot find the estate at all.
const FALLBACK = { lat: -34.083, lng: 18.85 };

let estatePromise;
export function getEstateCenter() {
  if (!estatePromise) {
    estatePromise = (async () => {
      const tries = ['Sitari Country Estate, Somerset West, South Africa', 'Sitari Country Estate Main Gatehouse, Van Riebeeck Road, Somerset West, South Africa'];
      for (const q of tries) { const r = await geocode(q); if (r && !r.partial) return r; }
      const any = await geocode(tries[0]);
      return any || FALLBACK;
    })();
  }
  return estatePromise;
}
export const ESTATE_RADIUS_M = 3500;

/** Returns {lat,lng,found}. found=true only when Google pinned the exact house; otherwise the pin lands on the street (or the estate) and the resident drags it. */
export async function geocodeHouse(number, streetName) {
  const est = await getEstateCenter();
  const near = r => r && haversine(r, est) <= ESTATE_RADIUS_M;
  const a = await geocode(`${number} ${streetName}, Sitari Country Estate, Somerset West`, est);
  if (near(a) && !a.partial) return { lat: a.lat, lng: a.lng, found: true };
  const b = await geocode(`${streetName}, Sitari Country Estate, Somerset West`, est);
  if (near(b)) return { lat: b.lat, lng: b.lng, found: false };
  if (near(a)) return { lat: a.lat, lng: a.lng, found: false };
  return { lat: est.lat, lng: est.lng, found: false };
}

export async function geocodeStreet(streetName) {
  const est = await getEstateCenter();
  const b = await geocode(`${streetName}, Sitari Country Estate, Somerset West`, est);
  return b && haversine(b, est) <= ESTATE_RADIUS_M ? { lat: b.lat, lng: b.lng } : null;
}

/** Once admins have pinned the streets, their centre becomes the estate centre. */
export function setEstateCenter(c) { estatePromise = Promise.resolve(c); }
