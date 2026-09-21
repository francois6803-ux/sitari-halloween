'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import HouseForm from './HouseForm';
import GMap from './GMap';
import { getEstateCenter } from '../lib/maps';

export const EVENTS = {
  preparing: ['🕸️ Preparing', 'Map is visible, registration is closed.'],
  open: ['📝 Registration open', 'Residents can register and edit their houses.'],
  night: ['🎃 Halloween Night', 'Full experience. Registration stays open.'],
  finished: ['👻 Event finished', 'Map stays visible, registration closed, thank-you banner shown.']
};
const hhmm = t => (t ? String(t).slice(0, 5) : '');
const fmtD = t => new Date(t).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
const badge = {
  pending: <span className="badge b-warn">🟡 Pending</span>, approved: <span className="badge b-good">🟢 Approved</span>,
  rejected: <span className="badge b-bad">🔴 Rejected</span>, removed: <span className="badge b-bad">🚫 Removed</span>
};

export default function Admin({ streets, stage, onStage, onClose, onChanged, toast }) {
  const [tab, setTab] = useState('dash');
  const [houses, setHouses] = useState([]);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [view, setView] = useState(null); // {mode:'edit'|'view', house, note}
  const [confirm, setConfirm] = useState(null);
  const [streetEdit, setStreetEdit] = useState(null);
  const sName = id => streets.find(s => s.id === id)?.name || id;
  const addr = h => `${h.house_number} ${sName(h.street_id)}`;

  const load = useCallback(async () => {
    const [h, r] = await Promise.all([
      supabase.from('houses').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false })
    ]);
    if (h.data) setHouses(h.data);
    if (r.data) setReports(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const st = useMemo(() => {
    const ap = houses.filter(h => h.status === 'approved'), pend = houses.filter(h => h.status === 'pending').length;
    return { part: ap.length, notw: ap.filter(h => h.participation === 'registered').length, pend, total: ap.length + pend, rep: reports.filter(r => r.status === 'open').length };
  }, [houses, reports]);

  async function setStatus(id, status, msg) {
    const { error } = await supabase.from('houses').update({ status }).eq('id', id);
    if (error) { toast('Could not update: ' + error.message); return; }
    toast(msg); await load(); onChanged();
  }
  async function setReport(id, status) {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) toast(error.message); else { await load(); toast(status === 'resolved' ? 'Report marked as resolved.' : 'Report dismissed.'); }
  }
  async function openEdit(h) {
    const { data } = await supabase.from('house_notes').select('note').eq('house_id', h.id).maybeSingle();
    setView({ mode: 'edit', house: h, note: data?.note || '' });
  }
  async function changeStage(k) {
    const { error } = await supabase.from('event_settings').update({ stage: k, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) toast(error.message); else { onStage(k); toast('Event stage: ' + EVENTS[k][0]); }
  }

  const list = houses.filter(h => (filter === 'all' || h.status === filter) && (!q || addr(h).toLowerCase().includes(q.toLowerCase())));
  const per = streets.map(s => [s.name, houses.filter(h => h.street_id === s.id && (h.status === 'approved' || h.status === 'pending')).length]).filter(p => p[1] > 0);
  const mx = Math.max(1, ...per.map(p => p[1]));
  const tabs = [['dash', 'Dashboard'], ['regs', `Registrations (${houses.length})`], ['reps', `Reports (${st.rep})`], ['streets', 'Streets'], ['evt', 'Event']];

  return (
    <div id="admin">
      <div className="adm">
        <div className="adm-top"><h1>🎃 Admin · Sitari Halloween 2026</h1><button className="btn sec sm" onClick={onClose}>← BACK TO MAP</button></div>
        <div className="tabs" role="tablist">{tabs.map(t => <button key={t[0]} role="tab" className={'tab' + (tab === t[0] ? ' on' : '')} onClick={() => setTab(t[0])}>{t[1]}</button>)}</div>

        {tab === 'dash' && (<>
          <div className="cards">
            <button className="sc" onClick={() => { setFilter('approved'); setTab('regs'); }}><div className="n">🎃 {st.part}</div><div className="l">Participating</div><div className="s">Approved and on the map</div></button>
            <button className="sc" onClick={() => { setFilter('pending'); setTab('regs'); }}><div className="n">🟡 {st.pend}</div><div className="l">Pending approval</div><div className="s">Waiting for you</div></button>
            <div className="sc"><div className="n">🏠 {st.notw}</div><div className="l">Not welcoming</div><div className="s">Included in participating</div></div>
            <button className="sc" onClick={() => { setFilter('all'); setTab('regs'); }}><div className="n">📍 {st.total}</div><div className="l">Total registered</div><div className="s">Participating + pending</div></button>
            <button className="sc" onClick={() => setTab('reps')}><div className="n">🚩 {st.rep}</div><div className="l">Open reports</div><div className="s">Needs a look</div></button>
          </div>
          <div className="panel"><h3>Houses per street</h3>{per.length ? per.map(p => <div className="bar" key={p[0]}><span>{p[0]}</span><em><i style={{ width: `${(p[1] / mx) * 100}%` }} /></em><b>{p[1]}</b></div>) : <p className="meta">No registrations yet.</p>}</div>
          <div className="panel"><h3>Event status</h3><p>{EVENTS[stage][0]} — {EVENTS[stage][1]}</p></div>
        </>)}

        {tab === 'regs' && (<>
          <div className="filters">
            {['all', 'pending', 'approved', 'rejected', 'removed'].map(f => <button key={f} className={'tab' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)} {f === 'all' ? houses.length : houses.filter(h => h.status === f).length}</button>)}
            <input className="inp" placeholder="Search address…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search registrations" />
          </div>
          {list.length ? (<>
            <div className="rowh"><span>House</span><span>Participation</span><span>Approval</span><span>Registered</span><span>Updated</span><span>Actions</span></div>
            {list.map(h => (
              <div className="row" key={h.id}>
                <div className="c1"><b>{addr(h)}</b></div>
                <div>{h.participation === 'welcome' ? <span className="badge b-good">🎃 Welcoming</span> : <span className="badge b-dim">🏠 Registered</span>}</div>
                <div>{badge[h.status]}</div>
                <div><small>{fmtD(h.created_at)}</small></div><div><small>{fmtD(h.updated_at)}</small></div>
                <div className="ra">
                  <button className="btn sec sm" onClick={() => setView({ mode: 'view', house: h })}>VIEW</button>
                  {['pending', 'rejected', 'removed'].includes(h.status) && <button className="btn good sm" onClick={() => setStatus(h.id, 'approved', 'Approved. The pumpkin is now on the public map.')}>APPROVE</button>}
                  {h.status === 'pending' && <button className="btn danger sm" onClick={() => setStatus(h.id, 'rejected', 'Rejected. It stays off the public map.')}>REJECT</button>}
                  <button className="btn ghost sm" onClick={() => openEdit(h)}>EDIT</button>
                  {h.status !== 'removed' && <button className="btn danger sm" onClick={() => setConfirm({ h })}>REMOVE</button>}
                </div>
              </div>
            ))}
          </>) : <div className="panel"><p>No registrations match.</p></div>}
        </>)}

        {tab === 'reps' && (reports.length ? reports.map(r => {
          const h = houses.find(x => x.id === r.house_id);
          return (
            <div className="panel" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{r.reason}</b><span className={'badge ' + (r.status === 'open' ? 'b-warn' : 'b-dim')}>{r.status}</span></div>
              <p className="meta">{h ? addr(h) : 'Unknown house'} · {fmtD(r.created_at)}</p>
              {r.note && <p className="msg">“{r.note}”</p>}
              <div className="stack row" style={{ marginTop: 10 }}>
                {h && <button className="btn sec sm" onClick={() => setView({ mode: 'view', house: h })}>VIEW HOUSE</button>}
                {r.status === 'open' && <>
                  <button className="btn good sm" onClick={() => setReport(r.id, 'resolved')}>MARK RESOLVED</button>
                  <button className="btn ghost sm" onClick={() => setReport(r.id, 'dismissed')}>DISMISS</button>
                  {h && h.status !== 'removed' && <button className="btn danger sm" onClick={() => setConfirm({ h, rep: r.id })}>REMOVE HOUSE</button>}
                </>}
              </div>
            </div>
          );
        }) : <div className="panel"><p>No reports. 🎉</p></div>)}

        {tab === 'streets' && (<>
          <p className="lead">Drop one pin per street so residents land in the right place when Google doesn't know Sitari's addresses. Pan the map to the street, tap it, then save.</p>
          {streets.map(s => (
            <div className="panel" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, padding: 12 }}>
              <b>{s.name}</b>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {s.lat != null ? <span className="badge b-good">📍 Pinned</span> : <span className="badge b-warn">Not set</span>}
                <button className="btn sec sm" onClick={() => setStreetEdit(s)}>{s.lat != null ? 'MOVE' : 'SET'}</button>
              </span>
            </div>
          ))}
        </>)}

        {tab === 'evt' && (<>
          <p className="lead">Switch the event stage to change what residents see. It takes effect immediately.</p>
          {Object.keys(EVENTS).map(k => <button key={k} className={'evt' + (stage === k ? ' on' : '')} onClick={() => changeStage(k)}><b>{EVENTS[k][0]}</b><span>{EVENTS[k][1]}</span></button>)}
        </>)}
      </div>

      {view && (
        <div id="modal" onClick={e => { if (e.target.id === 'modal') setView(null); }}>
          <div className={'sheet' + (view.mode === 'edit' ? ' wide' : '')} role="dialog" aria-modal="true">
            {view.mode === 'edit' ? (
              <HouseForm admin streets={streets} house={view.house} note={view.note} user={null} toast={toast}
                onClose={() => setView(null)} onDone={async () => { setView(null); await load(); onChanged(); toast('Saved.'); }} />
            ) : (<>
              <div className="sh-top"><span className="eyebrow">🛠️ Registration</span><button className="x" onClick={() => setView(null)} aria-label="Close">✕</button></div>
              <h2>{addr(view.house)}</h2>
              <div style={{ display: 'flex', gap: 6, margin: '6px 0 10px' }}>{badge[view.house.status]}</div>
              <div className="mini" style={{ height: 220 }}><GMap mode="pick" pin={{ lat: view.house.lat, lng: view.house.lng }} zoom={19} /></div>
              <div className="kv"><span>Visitors</span><span>{view.house.participation === 'welcome' ? 'Welcome' : 'Registered, not welcoming'}</span></div>
              <div className="kv"><span>Hours</span><span>{view.house.start_time ? `${hhmm(view.house.start_time)} – ${hhmm(view.house.end_time)}` : 'Hours not specified.'}</span></div>
              <div className="kv"><span>Message</span><span>{view.house.message || '—'}</span></div>
              <div className="kv"><span>Registered</span><span>{fmtD(view.house.created_at)}</span></div>
              <div className="stack row">
                {view.house.status !== 'approved' && <button className="btn good" onClick={async () => { await setStatus(view.house.id, 'approved', 'Approved. The pumpkin is now on the public map.'); setView(null); }}>APPROVE</button>}
                {view.house.status === 'pending' && <button className="btn danger" onClick={async () => { await setStatus(view.house.id, 'rejected', 'Rejected.'); setView(null); }}>REJECT</button>}
                <button className="btn sec" onClick={() => openEdit(view.house)}>EDIT / MOVE PIN</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {streetEdit && (
        <div id="modal" onClick={e => { if (e.target.id === 'modal') setStreetEdit(null); }}>
          <div className="sheet wide" role="dialog" aria-modal="true">
            <StreetPinner street={streetEdit} streets={streets} toast={toast} onClose={() => setStreetEdit(null)}
              onSaved={async () => { setStreetEdit(null); await onChanged(); toast('Street location saved.'); }} />
          </div>
        </div>
      )}

      {confirm && (
        <div id="dialog" onClick={e => { if (e.target.id === 'dialog') setConfirm(null); }}>
          <div className="dlg" role="alertdialog" aria-modal="true">
            <h2>Remove this house?</h2><p>{addr(confirm.h)} will disappear from the public map.</p>
            <div className="stack">
              <button className="btn danger" onClick={async () => { if (confirm.rep) await supabase.from('reports').update({ status: 'resolved' }).eq('id', confirm.rep); await setStatus(confirm.h.id, 'removed', 'House removed from the map.'); setConfirm(null); }}>REMOVE HOUSE</button>
              <button className="btn sec" onClick={() => setConfirm(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StreetPinner({ street, streets, onSaved, onClose, toast }) {
  const [pin, setPin] = useState(street.lat != null ? { lat: street.lat, lng: street.lng } : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pin) return;
    (async () => {
      const a = streets.filter(x => x.lat != null);
      if (a.length) setPin({ lat: a.reduce((t, x) => t + x.lat, 0) / a.length, lng: a.reduce((t, x) => t + x.lng, 0) / a.length });
      else setPin(await getEstateCenter());
    })();
    // eslint-disable-next-line
  }, []);
  async function save() {
    setBusy(true);
    const { error } = await supabase.from('streets').update({ lat: pin.lat, lng: pin.lng }).eq('id', street.id);
    setBusy(false);
    if (error) toast('Could not save: ' + error.message); else onSaved();
  }
  return (<>
    <div className="sh-top"><span className="eyebrow">📍 Street location</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
    <h2>{street.name}</h2>
    <p className="lead">Pan and zoom to this street, then tap the map (or drag the pumpkin) to drop the pin in the middle of it.</p>
    <div className="mini" style={{ height: 360 }}>{pin && <GMap mode="pick" pin={pin} onPin={setPin} zoom={17} />}</div>
    <div className="stack row"><button className="btn pri" disabled={!pin || busy} onClick={save}>{busy ? 'SAVING…' : 'SAVE STREET LOCATION'}</button><button className="btn ghost" onClick={onClose}>CANCEL</button></div>
  </>);
}
