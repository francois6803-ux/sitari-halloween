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

async function geocode(address) {
  try {
    await loadMaps();
    const { Geocoder } = await window.google.maps.importLibrary('geocoding');
    const res = await new Geocoder().geocode({ address, region: 'ZA' });
    const r = res.results && res.results[0];
    if (!r) return null;
    return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), partial: !!r.partial_match };
  } catch (e) {
    return null;
  }
}

let estatePromise;
export function getEstateCenter() {
  if (!estatePromise) {
    estatePromise = geocode('Sitari Country Estate, Somerset West, South Africa').then(r => r || { lat: -34.0, lng: 18.85 });
  }
  return estatePromise;
}
export const ESTATE_RADIUS_M = 2500;

export async function geocodeHouse(number, streetName) {
  const est = await getEstateCenter();
  const r = await geocode(`${number} ${streetName}, Sitari Country Estate, Somerset West, South Africa`);
  if (r && !r.partial && haversine(r, est) <= ESTATE_RADIUS_M) return { ...r, found: true };
  return { lat: est.lat, lng: est.lng, found: false };
}
