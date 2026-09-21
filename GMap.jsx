'use client';
import { useEffect, useRef, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { loadMaps, getEstateCenter } from '../lib/maps';

/* Midnight-purple map style (applied in code, no Cloud Console setup needed). */
const SPOOKY = [
  { elementType: 'geometry', stylers: [{ color: '#1a1040' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b9abdd' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0620' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a2a78' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#160d3a' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1d1650' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#12322f' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3b2d7a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#241852' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d8caff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#5a49a8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2a55' }] }
];

const PALETTE = {
  lit: ['#ee7a12', '#ff9a2e', '#fff0a0', '#c85f06', '#4f9a3a'],
  dim: ['#7a4a22', '#8b5628', '#3a2314', '#5a3517', '#3c5a30'],
  ghost: ['#6b5b99', '#7a6aa8', '#3b2f66', '#4a3d7a', '#5a4d88']
};
const SIZE = { lit: 46, dim: 42, ghost: 42, sel: 68, pin: 64 };
const urls = {};
function pumpkinUrl(v) {
  if (urls[v]) return urls[v];
  const base = v === 'sel' || v === 'pin' ? 'lit' : v;
  const [b, b2, f, r, s] = PALETTE[base];
  const glow = base === 'lit' ? '<circle cx="32" cy="32" r="31" fill="url(#g)"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g"><stop offset="0" stop-color="#ffb347" stop-opacity=".9"/><stop offset=".5" stop-color="#ff8a1f" stop-opacity=".32"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient></defs>${glow}<g transform="translate(12 12)" opacity="${base === 'ghost' ? '.75' : '1'}"><path d="M18.5 12C18.5 7 21 4.5 25 4C24.2 6.5 23.4 9 23.2 12Z" fill="${s}"/><ellipse cx="12.5" cy="24" rx="9.5" ry="12" fill="${b}"/><ellipse cx="27.5" cy="24" rx="9.5" ry="12" fill="${b}"/><ellipse cx="20" cy="24" rx="10" ry="12.6" fill="${b2}"/><path d="M13.5 12.5C11 18 11 30 14 35.5M26.5 12.5C29 18 29 30 26 35.5" fill="none" stroke="${r}" stroke-width="1.1" opacity=".7"/><path d="M12.3 22.5L15.6 17.2L18.9 22.5ZM21.1 22.5L24.4 17.2L27.7 22.5Z" fill="${f}"/><path d="M20 24.2L18.4 27.2L21.6 27.2Z" fill="${f}"/><path d="M10.8 28.2L14 27.4L15.6 30.2L18.2 28.4L20 31.2L21.8 28.4L24.4 30.2L26 27.4L29.2 28.2Q20 38.5 10.8 28.2Z" fill="${f}"/></g></svg>`;
  return (urls[v] = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg));
}
function iconFor(v) {
  const g = window.google.maps, s = SIZE[v] || 46;
  return { url: pumpkinUrl(v), scaledSize: new g.Size(s, s), anchor: new g.Point(s / 2, s / 2) };
}
function clusterIcon(n) {
  const g = window.google.maps, s = n < 10 ? 44 : n < 100 ? 52 : 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64"><defs><radialGradient id="c" cx=".35" cy=".3"><stop offset="0" stop-color="#ffc067"/><stop offset="1" stop-color="#ee7a12"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="#ff8a1f" opacity=".3"/><circle cx="32" cy="32" r="24" fill="url(#c)" stroke="#fff3c4" stroke-width="3"/></svg>`;
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new g.Size(s, s), anchor: new g.Point(s / 2, s / 2) };
}

/**
 * mode "browse": clustered pumpkins on the midnight map, selection.
 * mode "pick": one draggable pin on satellite view (pin={lat,lng}); tap the map to move it.
 */
export default function GMap({ houses = [], ghost = null, selectedId = null, onSelect, mode = 'browse', pin = null, onPin, focus = null, zoom = 16 }) {
  const box = useRef(null);
  const st = useRef({});
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const onPinRef = useRef(onPin); onPinRef.current = onPin;
  const onSelRef = useRef(onSelect); onSelRef.current = onSelect;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        await loadMaps();
        const { Map } = await window.google.maps.importLibrary('maps');
        const { Marker } = await window.google.maps.importLibrary('marker');
        const est = focus || pin || (await getEstateCenter());
        if (dead) return;
        const map = new Map(box.current, {
          center: { lat: est.lat, lng: est.lng }, zoom, styles: SPOOKY,
          mapTypeId: mode === 'pick' ? 'hybrid' : 'roadmap', backgroundColor: '#0a0620',
          streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy',
          mapTypeControlOptions: { position: window.google.maps.ControlPosition.LEFT_BOTTOM }
        });
        st.current = { map, Marker, byId: {}, clusterer: null, pinMarker: null };
        if (mode === 'pick') map.addListener('click', e => onPinRef.current && onPinRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        setReady(true);
      } catch (e) {
        setErr(e.message === 'no-key' ? 'no-key' : 'failed');
      }
    })();
    return () => { dead = true; const s = st.current; if (s.clusterer) s.clusterer.clearMarkers(); };
    // eslint-disable-next-line
  }, []);

  // houses -> markers (+ clusterer)
  useEffect(() => {
    const s = st.current; if (!ready || !s.map) return;
    if (s.clusterer) s.clusterer.clearMarkers();
    Object.values(s.byId).forEach(m => m.setMap(null));
    s.byId = {};
    const all = houses.map(h => ({ id: h.id, lat: h.lat, lng: h.lng, v: h.participation === 'registered' ? 'dim' : 'lit' }));
    if (ghost) all.push({ id: ghost.id, lat: ghost.lat, lng: ghost.lng, v: 'ghost' });
    const markers = all.map(h => {
      const m = new s.Marker({ position: { lat: h.lat, lng: h.lng }, icon: iconFor(h.v), title: 'Halloween house' });
      m.addListener('click', () => onSelRef.current && onSelRef.current(h.id));
      m._v = h.v; s.byId[h.id] = m; return m;
    });
    if (mode === 'browse') {
      s.clusterer = new MarkerClusterer({
        map: s.map, markers,
        renderer: { render: ({ count, position }) => new s.Marker({ position, icon: clusterIcon(count), label: { text: String(count), color: '#2a1000', fontWeight: '900', fontSize: '14px' }, zIndex: 1000 + count }) }
      });
    } else markers.forEach(m => m.setMap(s.map));
  }, [ready, houses, ghost, mode]);

  // selection
  useEffect(() => {
    const s = st.current; if (!ready || !s.map) return;
    Object.entries(s.byId).forEach(([id, m]) => { const on = id === selectedId; m.setIcon(iconFor(on ? 'sel' : m._v)); m.setZIndex(on ? 9999 : undefined); });
    const h = houses.find(x => x.id === selectedId);
    if (h) { s.map.panTo({ lat: h.lat, lng: h.lng }); if ((s.map.getZoom() || 0) < 18) s.map.setZoom(18); }
  }, [ready, selectedId, houses]);

  // draggable pin
  useEffect(() => {
    const s = st.current; if (!ready || !s.map || mode !== 'pick' || !pin) return;
    if (!s.pinMarker) {
      const g = window.google.maps;
      const m = new s.Marker({ map: s.map, position: pin, draggable: true, icon: iconFor('pin'), animation: g.Animation.BOUNCE, title: 'Drag me onto your house', zIndex: 5000 });
      m.addListener('dragend', e => onPinRef.current && onPinRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
      s.pinMarker = m;
    } else s.pinMarker.setPosition(pin);
    s.map.panTo(pin);
  }, [ready, pin, mode]);

  // external focus (search / street)
  useEffect(() => {
    const s = st.current; if (!ready || !s.map || !focus) return;
    if (focus.bounds) s.map.fitBounds(focus.bounds, 60);
    else { s.map.panTo({ lat: focus.lat, lng: focus.lng }); if (focus.zoom) s.map.setZoom(focus.zoom); }
  }, [ready, focus]);

  if (err) return (
    <div className="nomap"><div>
      <div style={{ fontSize: 46 }}>🗺️</div>
      <p style={{ marginTop: 8 }}>{err === 'no-key' ? 'The map is not connected yet (Google Maps key missing).' : 'The map could not load. Please refresh.'}</p>
    </div></div>
  );
  return <div ref={box} className="gm" />;
}
