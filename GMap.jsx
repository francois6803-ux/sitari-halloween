'use client';
import { useEffect, useRef, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { loadMaps, getEstateCenter, HAS_KEY } from '../lib/maps';

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

function pumpkin(cls) {
  const d = document.createElement('div');
  d.className = 'gpk ' + (cls || '');
  d.textContent = '🎃';
  return d;
}
function clusterEl(n) {
  const d = document.createElement('div');
  d.className = 'gcl';
  d.textContent = String(n);
  return d;
}

/**
 * mode "browse": clustered pumpkins, selection.
 * mode "pick": one draggable pin (pin={lat,lng}), tap the map to move it.
 */
export default function GMap({ houses = [], ghost = null, selectedId = null, onSelect, mode = 'browse', pin = null, onPin, focus = null, zoom = 16 }) {
  const box = useRef(null);
  const st = useRef({});
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        await loadMaps();
        const { Map } = await window.google.maps.importLibrary('maps');
        const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');
        const est = focus || pin || (await getEstateCenter());
        if (dead) return;
        const map = new Map(box.current, {
          center: { lat: est.lat, lng: est.lng }, zoom, mapId: MAP_ID, mapTypeId: 'hybrid',
          streetViewControl: false, fullscreenControl: false, gestureHandling: 'greedy',
          mapTypeControlOptions: { position: window.google.maps.ControlPosition.LEFT_BOTTOM }
        });
        st.current = { map, AdvancedMarkerElement, byId: {}, clusterer: null, pinMarker: null };
        if (mode === 'pick') {
          map.addListener('click', e => onPinRef.current && onPinRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        }
        setReady(true);
      } catch (e) {
        setErr(e.message === 'no-key' ? 'no-key' : 'failed');
      }
    })();
    return () => { dead = true; const s = st.current; if (s.clusterer) s.clusterer.clearMarkers(); };
    // eslint-disable-next-line
  }, []);

  const onPinRef = useRef(onPin); onPinRef.current = onPin;
  const onSelRef = useRef(onSelect); onSelRef.current = onSelect;

  // houses -> markers (+ clusterer)
  useEffect(() => {
    const s = st.current; if (!ready || !s.map) return;
    if (s.clusterer) s.clusterer.clearMarkers();
    Object.values(s.byId).forEach(m => { m.map = null; });
    s.byId = {};
    const all = houses.map(h => ({ id: h.id, lat: h.lat, lng: h.lng, cls: h.participation === 'registered' ? 'dim' : '' }));
    if (ghost) all.push({ id: ghost.id, lat: ghost.lat, lng: ghost.lng, cls: 'ghost' });
    const markers = all.map(h => {
      const m = new s.AdvancedMarkerElement({ position: { lat: h.lat, lng: h.lng }, content: pumpkin(h.cls), title: 'Halloween house' });
      m.addListener('click', () => onSelRef.current && onSelRef.current(h.id));
      m._cls = h.cls; s.byId[h.id] = m; return m;
    });
    if (mode === 'browse') {
      s.clusterer = new MarkerClusterer({
        map: s.map, markers,
        renderer: { render: ({ count, position }) => new s.AdvancedMarkerElement({ position, content: clusterEl(count), zIndex: 1000 + count }) }
      });
    } else markers.forEach(m => { m.map = s.map; });
  }, [ready, houses, ghost, mode]);

  // selection
  useEffect(() => {
    const s = st.current; if (!ready || !s.map) return;
    Object.entries(s.byId).forEach(([id, m]) => { m.content.className = 'gpk ' + (m._cls || '') + (id === selectedId ? ' sel' : ''); m.zIndex = id === selectedId ? 9999 : undefined; });
    const h = houses.find(x => x.id === selectedId);
    if (h) { s.map.panTo({ lat: h.lat, lng: h.lng }); if ((s.map.getZoom() || 0) < 18) s.map.setZoom(18); }
  }, [ready, selectedId, houses]);

  // pin
  useEffect(() => {
    const s = st.current; if (!ready || !s.map || mode !== 'pick' || !pin) return;
    if (!s.pinMarker) {
      const m = new s.AdvancedMarkerElement({ map: s.map, position: pin, content: pumpkin('pin'), gmpDraggable: true, title: 'Drag me onto your house' });
      m.addListener('dragend', () => { const p = m.position; onPinRef.current && onPinRef.current({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng }); });
      s.pinMarker = m;
    } else s.pinMarker.position = pin;
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
