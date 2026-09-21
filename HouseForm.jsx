'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { geocodeHouse, getEstateCenter, haversine, ESTATE_RADIUS_M } from '../lib/maps';
import GMap from './GMap';

const hhmm = t => (t ? String(t).slice(0, 5) : '');
const CHIPS = ['Little ones welcome!', 'Candy ready! 🎃', 'Please knock!', 'Costumes encouraged!'];
const partLabel = p => (p === 'welcome' ? '🟢 Trick-or-treaters welcome' : '🏠 Registered — not welcoming visitors right now');

/** New registration (5 steps) or edit (all sections). admin=true lets an admin correct pin + note. */
export default function HouseForm({ user, streets, house = null, admin = false, note = '', onDone, onClose, toast }) {
  const editing = !!house;
  const [step, setStep] = useState(editing ? 'all' : 1);
  const [f, setF] = useState({
    street_id: house?.street_id || '', number: house ? String(house.house_number) : '',
    lat: house?.lat ?? null, lng: house?.lng ?? null, confirmed: editing,
    part: house?.participation || 'welcome', start: hhmm(house?.start_time), end: hhmm(house?.end_time),
    message: house?.message || '', authorised: false, note
  });
  const [applied, setApplied] = useState({ street_id: house?.street_id || '', number: house ? String(house.house_number) : '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [adjusting, setAdjusting] = useState(editing);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const streetName = id => streets.find(s => s.id === id)?.name || id;
  const E = (title, text) => setErr({ title, text });

  async function findAddress() {
    setErr(null);
    const n = parseInt(f.number, 10);
    if (!f.street_id || !(n > 0)) { E('Address not found', "We couldn't find that address. Please check the house number and street."); return false; }
    setBusy(true);
    let r = await geocodeHouse(n, streetName(f.street_id));
    const anchor = streets.find(s => s.id === f.street_id);
    if (!r.found && anchor && anchor.lat != null) r = { lat: anchor.lat, lng: anchor.lng, found: false };
    setBusy(false);
    setManual(!r.found);
    setF(o => ({ ...o, number: String(n), lat: r.lat, lng: r.lng, confirmed: false }));
    setApplied({ street_id: f.street_id, number: String(n) });
    setAdjusting(!r.found || editing);
    return true;
  }
  async function onPin(p) {
    const est = await getEstateCenter();
    if (haversine(p, est) > ESTATE_RADIUS_M) { toast('That spot is outside Sitari. Move the pumpkin onto the estate.'); return; }
    setF(o => ({ ...o, lat: p.lat, lng: p.lng, confirmed: !!admin }));
  }
  function hoursErr() {
    if (!f.start && !f.end) return '';
    if (!f.start || !f.end) return 'Set both a start and an end time, or leave both empty.';
    if (f.end <= f.start) return 'The end time must be after the start time.';
    return '';
  }
  const addrDirty = f.street_id !== applied.street_id || String(parseInt(f.number, 10)) !== applied.number;

  async function save() {
    setErr(null);
    if (addrDirty) { E('Check the new address first', 'Press UPDATE ADDRESS to confirm the new house number and street.'); return; }
    const he = hoursErr(); if (he) { E('Check the hours', he); return; }
    if (!f.confirmed) { E('Location needs confirmation', 'We found the area, but we need you to confirm your exact house location.'); return; }
    setBusy(true);
    const row = {
      street_id: f.street_id, house_number: parseInt(f.number, 10), lat: f.lat, lng: f.lng, participation: f.part,
      start_time: f.start || null, end_time: f.end || null, message: (f.message || '').trim() || null, location_confirmed: true
    };
    let res;
    if (editing) res = await supabase.from('houses').update(row).eq('id', house.id).select('id,status').single();
    else res = await supabase.from('houses').insert({ ...row, owner_id: user.id, status: 'pending' }).select('id,status').single();
    if (res.error) {
      setBusy(false);
      const m = res.error.message || '';
      if (res.error.code === '23505') {
        if (m.includes('one_active_per_owner')) E('You already have a house', 'You can only register one house. Edit or remove your existing one first.');
        else E('Already registered', 'This house has already been registered. If it is yours and something looks wrong, contact the estate administrator.');
      } else if (m.includes('row-level security')) E('Registration is closed', 'Registration is not open right now.');
      else E('Something went wrong', m);
      return;
    }
    if (admin) {
      await supabase.from('house_notes').upsert({ house_id: house.id, note: f.note || '', updated_at: new Date().toISOString() });
    }
    setBusy(false);
    onDone(res.data, { editing, sentBack: editing && !admin && house.status === 'approved' && res.data.status === 'pending' });
  }

  const dots = typeof step === 'number' ? (
    <div className="dots" role="img" aria-label="Registration progress">{[1, 2, 5].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
  ) : null;
  const Err = () => err ? <div className="err" role="alert"><b>{err.title}</b>{err.text}</div> : null;

  const Address = (
    <>
      <label className="fld" htmlFor="hn">House number</label>
      <input id="hn" className="inp" inputMode="numeric" maxLength={4} placeholder="e.g. 12" value={f.number} onChange={e => set('number', e.target.value.replace(/\D/g, ''))} />
      <label className="fld" htmlFor="hs">Street</label>
      <select id="hs" className="inp" value={f.street_id} onChange={e => set('street_id', e.target.value)}>
        <option value="">Choose your street…</option>
        {streets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </>
  );
  const Location = f.lat != null && (
    <>
      <div className="mini" style={{ height: 300 }}>
        <GMap mode="pick" pin={{ lat: f.lat, lng: f.lng }} onPin={onPin} zoom={19} />
      </div>
      {manual && <div className="err warn"><b>We couldn't pin this address automatically</b>New addresses are sometimes missing from Google. Drag the pumpkin onto your house, then confirm. An administrator will check it.{typeof window !== 'undefined' && window.__geoErr ? ` (Google said: ${window.__geoErr})` : ''}</div>}
      {adjusting && <p className="hint">Drag the pumpkin, or tap the map, to sit it exactly on your house.</p>}
      {f.confirmed ? <div className="ok">✅ Location confirmed</div> : null}
    </>
  );
  const Part = (
    <>
      <button type="button" className={'choice' + (f.part === 'welcome' ? ' on' : '')} onClick={() => set('part', 'welcome')}><b>🎃 YES</b><span>Come knock! Your pumpkin will glow.</span></button>
      <button type="button" className={'choice' + (f.part === 'registered' ? ' on' : '')} onClick={() => set('part', 'registered')}><b>🏠 REGISTERED</b><span>We're taking part, but not welcoming visitors.</span></button>
    </>
  );
  const Extras = (
    <>
      <div className="two">
        <div><label className="fld" htmlFor="st">Start time</label><input id="st" type="time" className="inp" value={f.start} onChange={e => set('start', e.target.value)} /></div>
        <div><label className="fld" htmlFor="en">End time</label><input id="en" type="time" className="inp" value={f.end} onChange={e => set('end', e.target.value)} /></div>
      </div>
      <p className="hint">Leave both empty and we'll show “Hours not specified.”</p>
      <label className="fld" htmlFor="ms">Short message for visitors</label>
      <input id="ms" className="inp" maxLength={60} placeholder="Little ones welcome!" value={f.message} onChange={e => set('message', e.target.value)} />
      <div className="chips">{CHIPS.map(c => <button type="button" key={c} onClick={() => set('message', c)}>{c}</button>)}</div>
      <div className="note">🌍 This message is shown publicly on the map. Keep it friendly.</div>
    </>
  );

  return (
    <>
      <div className="sh-top"><span className="eyebrow">{admin ? '🛠️ Admin edit' : editing ? '✏️ Edit my house' : '🎃 Register your house'}</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {dots}

      {step === 1 && (<>
        <h2>Where is your Halloween house?</h2>{Address}<Err />
        <div className="stack"><button className="btn pri" disabled={busy} onClick={async () => { if (await findAddress()) setStep(2); }}>{busy ? 'FINDING…' : 'FIND MY HOUSE'}</button></div>
      </>)}

      {step === 2 && (<>
        <h2>Is this your house?</h2><p className="lead">{f.number} {streetName(f.street_id)}</p>
        {Location}<Err />
        <div className="stack">
          {!f.confirmed && <button className="btn pri" onClick={() => { set('confirmed', true); setAdjusting(false); setStep(5); }}>{adjusting ? 'CONFIRM THIS LOCATION' : 'YES — THIS IS MY HOUSE'}</button>}
          {f.confirmed && <button className="btn pri" onClick={() => setStep(5)}>NEXT</button>}
          {!adjusting && <button className="btn sec" onClick={() => setAdjusting(true)}>ADJUST LOCATION</button>}
          <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
        </div>
      </>)}

      {step === 3 && (<>
        <h2>Are trick-or-treaters welcome?</h2>{Part}
        <div className="stack"><button className="btn pri" disabled={!f.part} onClick={() => setStep(4)}>NEXT</button><button className="btn ghost" onClick={() => setStep(2)}>← Back</button></div>
      </>)}

      {step === 4 && (<>
        <h2>Anything to add? <small style={{ fontWeight: 600, color: 'var(--muted)' }}>(optional)</small></h2>{Extras}<Err />
        <div className="stack"><button className="btn pri" onClick={() => { const he = hoursErr(); if (he) { E('Check the hours', he); return; } setErr(null); setStep(5); }}>REVIEW MY HOUSE</button><button className="btn ghost" onClick={() => setStep(3)}>← Back</button></div>
      </>)}

      {step === 5 && (<>
        <h2>Your Halloween house</h2>
        <div className="preview">
          <div className="ch"><span>🎃 HALLOWEEN HOUSE</span></div>
          <div className="addr">{f.number} {streetName(f.street_id)}</div>
        </div>
        <label className="chk"><input type="checkbox" checked={f.authorised} onChange={e => set('authorised', e.target.checked)} /> <span>I confirm I'm authorised to register this property, and I'm happy for this information to be shown publicly on the map.</span></label>
        <div className="note">An administrator checks your house before the pumpkin appears on the public map.</div><Err />
        <div className="stack"><button className="btn pri" disabled={!f.authorised || busy} onClick={save}>{busy ? 'SUBMITTING…' : '🎃 SUBMIT MY HOUSE'}</button><button className="btn ghost" onClick={() => setStep(2)}>← Back</button></div>
      </>)}

      {step === 'all' && (<>
        <h2>{streetName(house.street_id)} {house.house_number}</h2>
        <div className="edgrid"><div>
          {Address}
          <div className="stack row" style={{ marginTop: 10 }}><button className="btn sec sm" disabled={busy} onClick={findAddress}>{busy ? 'FINDING…' : 'UPDATE ADDRESS'}</button></div>
          <label className="fld">Location on the map</label>
          {Location}
          {!f.confirmed && <div className="err warn"><b>Location needs confirmation</b>We found the area, but we need you to confirm your exact house location.<div style={{ marginTop: 10 }}><button className="btn pri sm" onClick={() => set('confirmed', true)}>CONFIRM THIS LOCATION</button></div></div>}
        </div><div>
          {admin ? (<><label className="fld" htmlFor="nt">Private admin note</label><textarea id="nt" className="inp" placeholder="Only administrators see this" value={f.note} onChange={e => set('note', e.target.value)} /></>)
            : <div className="note">Changing the address or location sends your house back for approval.</div>}
        </div></div>
        <Err />
        <div className="stack row"><button className="btn pri" disabled={busy || !f.part} onClick={save}>{busy ? 'SAVING…' : 'SAVE CHANGES'}</button><button className="btn ghost" onClick={onClose}>CANCEL</button></div>
      </>)}
    </>
  );
}
