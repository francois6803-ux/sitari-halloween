'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import GMap from './GMap';
import HouseForm from './HouseForm';
import Admin, { EVENTS } from './Admin';

const PUB = 'id,street_id,house_number,lat,lng,participation,start_time,end_time,message';
const hhmm = t => (t ? String(t).slice(0, 5) : '');
const partLabel = p => (p === 'welcome' ? '🟢 Trick-or-treaters welcome' : '🏠 Registered — not welcoming visitors right now');
const STATUS = { pending: '🟡 Pending approval', approved: '🟢 Approved', rejected: '🔴 Not approved', removed: '🔴 Removed' };
const REASONS = ['Incorrect location', 'Inappropriate message', 'No longer participating', 'Duplicate or fake listing', 'Something else'];
const GOOGLE_LOGIN = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN === '1';

export default function App() {
  const [streets, setStreets] = useState([]);
  const [houses, setHouses] = useState([]);
  const [stage, setStage] = useState('preparing');
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mine, setMine] = useState(null);
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState(null);
  const [sheet, setSheet] = useState(null); // signin | form | my | report | edit
  const [menu, setMenu] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [q, setQ] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const intent = useRef(null);
  const tt = useRef();
  const toast = useCallback(m => { setToastMsg(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToastMsg(''), 3600); }, []);

  const sName = id => streets.find(s => s.id === id)?.name || id;
  const addr = h => `${h.house_number} ${sName(h.street_id)}`;
  const regOpen = stage === 'open' || stage === 'night';

  const loadPublic = useCallback(async () => {
    const [s, h, e] = await Promise.all([
      supabase.from('streets').select('id,name').order('name'),
      supabase.from('houses').select(PUB).eq('status', 'approved'),
      supabase.from('event_settings').select('stage').eq('id', 1).maybeSingle()
    ]);
    if (s.data) setStreets(s.data);
    if (h.data) setHouses(h.data);
    if (e.data) setStage(e.data.stage);
    setLoaded(true);
  }, []);
  const loadMine = useCallback(async uid => {
    if (!uid) { setMine(null); setIsAdmin(false); return; }
    const [m, a] = await Promise.all([
      supabase.from('houses').select('*').eq('owner_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle()
    ]);
    setMine(m.data || null); setIsAdmin(!!a.data);
  }, []);

  useEffect(() => {
    loadPublic();
    const iv = setInterval(loadPublic, 30000);
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); loadMine(data.session?.user?.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user || null; setUser(u); loadMine(u?.id);
      if (u && intent.current) { const i = intent.current; intent.current = null; setSheet(null); setTimeout(() => setSheet(i), 50); }
    });
    return () => { clearInterval(iv); sub.subscription.unsubscribe(); };
  }, [loadPublic, loadMine]);

  const ghost = mine && mine.status === 'pending' ? { id: mine.id, lat: mine.lat, lng: mine.lng } : null;
  const selHouse = useMemo(() => houses.find(h => h.id === sel) || (mine && mine.id === sel ? mine : null), [sel, houses, mine]);
  const selIsGhost = selHouse && mine && selHouse.id === mine.id && mine.status !== 'approved';
  const activeMine = mine && (mine.status === 'pending' || mine.status === 'approved');

  async function need(name) {
    // Residents never sign in: a silent anonymous session (no email, no password) is created on first use.
    if (!user) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) { toast('Something went wrong. Please try again.'); return; }
    }
    setSheet(name);
  }
  function startRegister() {
    if (!regOpen) { toast(stage === 'preparing' ? 'Registration opens soon.' : 'Registration has closed.'); return; }
    if (activeMine) { toast('You already have a house registered. You can edit it here.'); setSheet('my'); return; }
    need('form');
  }

  /* search */
  const sugg = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    let num = null, rest = t, m;
    if ((m = t.match(/^(\d+)\s*(.*)$/))) { num = +m[1]; rest = m[2]; } else if ((m = t.match(/^(.*?)[\s,]+(\d+)$/))) { num = +m[2]; rest = m[1]; }
    const ss = streets.filter(s => !rest || s.name.toLowerCase().includes(rest)).slice(0, 6);
    if (num == null) return ss.map(s => ({ t: 'street', s, c: houses.filter(h => h.street_id === s.id).length }));
    return ss.map(s => ({ t: 'house', s, n: num, h: houses.find(h => h.street_id === s.id && h.house_number === num) }));
  }, [q, streets, houses]);
  function go(r) {
    setQ('');
    if (r.t === 'street') {
      const hs = houses.filter(h => h.street_id === r.s.id);
      if (!hs.length) { toast(`No pumpkins on ${r.s.name} yet.`); return; }
      const b = new window.google.maps.LatLngBounds(); hs.forEach(h => b.extend({ lat: h.lat, lng: h.lng })); setFocus({ bounds: b, k: Date.now() });
    } else if (r.h) { setSel(r.h.id); } else toast(`No pumpkin at ${r.n} ${r.s.name} yet.`);
  }

  /* actions */
  async function signInEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    return error;
  }
  async function signInGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) toast(error.message);
  }
  async function signOut() { await supabase.auth.signOut(); setMenu(false); setAdmin(false); toast('Signed out.'); }
  async function removeMine() {
    const { error } = await supabase.from('houses').update({ status: 'removed' }).eq('id', mine.id);
    if (error) toast(error.message); else { toast('Your house has been removed.'); setSel(null); await Promise.all([loadMine(user.id), loadPublic()]); }
  }
  async function sendReport(h, reason, note) {
    const { error } = await supabase.from('reports').insert({ house_id: h.id, reporter_id: user.id, reason, note: note || null });
    if (error) toast(error.code === '23505' ? "You've already reported this house." : 'Could not send the report.');
    else toast('Thanks. An administrator will review your report.');
    setSheet(null);
  }

  const count = houses.length;
  const banner = stage === 'preparing' ? '🕸️ Registration opens soon. The pumpkins are getting ready.' : stage === 'finished' ? '👻 Halloween 2026 has finished. Thanks for lighting up Sitari!' : null;

  return (
    <div id="app" className={selHouse ? 'card-open' : ''}>
      <div id="sky" />
      <GMap houses={houses} ghost={ghost} selectedId={sel} onSelect={setSel} focus={focus} zoom={16} />

      <div id="top" className="ui">
        <div className="title">SITARI</div>
        <div className="year">HALLOWEEN 2026</div>
        <div className="sub">The neighbourhood is coming alive…</div>
        <div className="count" aria-live="polite">🎃 <span>{loaded ? `${count} ${count === 1 ? 'house' : 'houses'} participating` : 'Loading…'}</span></div>
        {banner && <div className="banner">{banner}</div>}
        <div className="search">
          <span className="ico">🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a street or house…" autoComplete="off" aria-label="Search for a street or house"
            onKeyDown={e => { if (e.key === 'Enter' && sugg[0]) go(sugg[0]); }} />
          {q.trim() && (
            <div id="sugg">
              {sugg.length ? sugg.map((r, i) => (
                <button key={i} onClick={() => go(r)}>{r.t === 'street' ? '🛣️' : '🏠'}<span><b>{r.t === 'street' ? r.s.name : `${r.n} ${r.s.name}`}</b>
                  <small>{r.t === 'street' ? `${r.c} ${r.c === 1 ? 'pumpkin' : 'pumpkins'} on this street` : r.h ? '🎃 Halloween house' : 'Not on the Halloween map yet'}</small></span></button>
              )) : <button disabled>😕<span><b>No match</b><small>We couldn't find that address. Check the house number and street.</small></span></button>}
            </div>
          )}
        </div>
      </div>
      <button className="ui round" style={{ right: 12, top: 12 }} onClick={() => setMenu(m => !m)} aria-label="Menu">⋯</button>

      {loaded && count === 0 && !selHouse && (
        <div id="empty" className="ui"><h2>The pumpkins are waiting…</h2><p>No houses have joined Halloween yet. Be the first to light up Sitari.</p>
          {regOpen && <button className="btn pri" onClick={startRegister}>🎃 REGISTER YOUR HOUSE</button>}</div>
      )}

      {selHouse && (
        <div id="card" className="ui">
          <div className="ch"><span>🎃 HALLOWEEN HOUSE</span><button className="x" onClick={() => setSel(null)} aria-label="Close">✕</button></div>
          <div className="addr">{addr(selHouse)}</div>
          <div className="status">{selIsGhost ? '🟡 Pending approval' : stage === 'finished' ? '👻 Halloween 2026 has finished' : partLabel(selHouse.participation)}</div>
          {selIsGhost ? <div className="meta">Only you can see this pumpkin until an administrator approves it.</div>
            : <div className="meta">🕔 {selHouse.start_time ? `${hhmm(selHouse.start_time)} – ${hhmm(selHouse.end_time)}` : 'Hours not specified.'}</div>}
          {selHouse.message && !selIsGhost && <div className="msg">“{selHouse.message}”</div>}
          <div className="acts">
            {selIsGhost ? <button className="btn pri" onClick={() => setSheet('my')}>MY HOUSE</button>
              : <a className="btn pri" style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${selHouse.lat},${selHouse.lng}`}>🧭 GET DIRECTIONS</a>}
            {mine && mine.id === selHouse.id && !selIsGhost && <button className="btn sec" onClick={() => setSheet('my')}>MY HOUSE</button>}
          </div>
          {!(mine && mine.id === selHouse.id) && <button className="link" onClick={() => need('report')}>🚩 Report this house</button>}
        </div>
      )}

      <div id="bottom" className="ui">
        <div className="legend">
          <span className="chip"><span style={{ fontSize: 16 }}>🎃</span>Trick-or-treaters welcome</span>
          <span className="chip"><span style={{ fontSize: 16, filter: 'grayscale(.6) brightness(.6)' }}>🎃</span>Registered, not welcoming</span>
        </div>
        <div className="btnrow">
          {regOpen ? <button className="btn pri cta" onClick={startRegister}>🎃 REGISTER YOUR HOUSE</button>
            : <button className="btn cta" disabled>{stage === 'preparing' ? '🕸️ REGISTRATION OPENS SOON' : '👻 REGISTRATION CLOSED'}</button>}
          {activeMine && <button className="btn sec" onClick={() => setSheet('my')}><span className={'dot' + (mine.status === 'approved' ? ' g' : '')} />MY HOUSE</button>}
        </div>
      </div>

      {menu && (
        <div id="menu" onClick={() => setMenu(false)}><div className="menu-panel" onClick={e => e.stopPropagation()}>
          <button onClick={() => { setMenu(false); setSheet('my'); }}>🏠 My Halloween house</button>
          {isAdmin && <button onClick={() => { setMenu(false); setAdmin(true); }}>🛠️ Administrator area</button>}
          {user && !user.is_anonymous ? <button onClick={signOut}>↩ Sign out <small style={{ color: 'var(--muted)' }}>{user.email}</small></button> : <button onClick={() => { setMenu(false); setSheet('signin'); }}>🔑 Administrator sign-in</button>}
        </div></div>
      )}

      {sheet && (
        <div id="modal" onClick={e => { if (e.target.id === 'modal') { intent.current = null; setSheet(null); } }}>
          <div className={'sheet' + (sheet === 'edit' ? ' wide' : '')} role="dialog" aria-modal="true">
            {sheet === 'signin' && <SignIn onEmail={signInEmail} onGoogle={GOOGLE_LOGIN ? signInGoogle : null} onClose={() => { intent.current = null; setSheet(null); }} />}
            {sheet === 'form' && user && <HouseForm user={user} streets={streets} toast={toast} onClose={() => setSheet(null)}
              onDone={async () => { await Promise.all([loadMine(user.id), loadPublic()]); setSheet('done'); }} />}
            {sheet === 'done' && (<>
              <div className="big">🎃</div><h2 style={{ textAlign: 'center' }}>You're on the way!</h2>
              <p className="lead" style={{ textAlign: 'center' }}>Your Halloween house has been submitted. Your pumpkin appears on the public map once an administrator approves it.</p>
              <div className="stack"><button className="btn pri" onClick={() => { setSheet(null); if (mine) { setSel(mine.id); } }}>SEE MY PUMPKIN</button><button className="btn sec" onClick={() => setSheet(null)}>BACK TO THE MAP</button></div>
            </>)}
            {sheet === 'edit' && mine && <HouseForm user={user} streets={streets} house={mine} toast={toast} onClose={() => setSheet('my')}
              onDone={async (_r, o) => { await Promise.all([loadMine(user.id), loadPublic()]); toast(o.sentBack ? 'Saved. Your house needs approval again because the location changed.' : 'Saved.'); setSheet('my'); }} />}
            {sheet === 'my' && <MyHouse mine={mine} addr={mine ? addr(mine) : ''} regOpen={regOpen} onClose={() => setSheet(null)} onEdit={() => setSheet('edit')}
              onRegister={() => setSheet('form')} onShow={() => { setSheet(null); setSel(mine.id); }} onRemove={removeMine} />}
            {sheet === 'report' && selHouse && <Report house={selHouse} addr={addr(selHouse)} onClose={() => setSheet(null)} onSend={sendReport} />}
          </div>
        </div>
      )}

      {admin && isAdmin && <Admin streets={streets} stage={stage} onStage={setStage} toast={toast} onChanged={loadPublic} onClose={() => { setAdmin(false); loadPublic(); }} />}
      <div id="toast" role="status" aria-live="polite" className={toastMsg ? 'show' : ''}>{toastMsg}</div>
    </div>
  );
}

function SignIn({ onEmail, onGoogle, onClose }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const error = await onEmail(email.trim()); setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  return (<>
    <div className="sh-top"><span className="eyebrow">🔑 Administrator sign-in</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
    {sent ? (<><h2>Check your email 📬</h2><p className="lead">We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</p><div className="stack"><button className="btn sec" onClick={onClose}>OK</button></div></>) : (<>
      <h2>Administrator sign-in</h2><p className="lead">This is only for estate administrators. Residents don't need to sign in to register a house.</p>
      {onGoogle && <div className="stack"><button className="btn sec" onClick={onGoogle}>Continue with Google</button></div>}
      <form onSubmit={submit}>
        <label className="fld" htmlFor="em">Email address</label>
        <input id="em" className="inp" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        {err && <div className="err" role="alert"><b>Couldn't send the link</b>{err}</div>}
        <div className="stack"><button className="btn pri" type="submit" disabled={busy}>{busy ? 'SENDING…' : 'EMAIL ME A SIGN-IN LINK'}</button></div>
      </form>
    </>)}
  </>);
}

function MyHouse({ mine, addr, regOpen, onClose, onEdit, onRegister, onShow, onRemove }) {
  const [confirm, setConfirm] = useState(false);
  if (!mine) return (<>
    <div className="sh-top"><span className="eyebrow">🏠 My house</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
    <h2>You haven't registered a house yet</h2><p className="lead">Add your house to the Halloween map so trick-or-treaters can find you.</p>
    <div className="stack">{regOpen && <button className="btn pri" onClick={onRegister}>🎃 REGISTER YOUR HOUSE</button>}<button className="btn sec" onClick={onClose}>BACK TO THE MAP</button></div>
  </>);
  const live = mine.status === 'pending' || mine.status === 'approved';
  return (<>
    <div className="sh-top"><span className="eyebrow">🏠 My house</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
    <h2>{addr}</h2><div className="status" style={{ margin: '6px 0 10px' }}>{STATUS[mine.status]}</div>
    {mine.status === 'rejected' && <div className="note">An administrator couldn't approve this registration. You can edit it and it will be reviewed again.</div>}
    <div className="kv"><span>Visitors</span><span>{partLabel(mine.participation)}</span></div>
    <div className="kv"><span>Hours</span><span>{mine.start_time ? `${hhmm(mine.start_time)} – ${hhmm(mine.end_time)}` : 'Hours not specified.'}</span></div>
    <div className="kv"><span>Message</span><span>{mine.message || '—'}</span></div>
    {confirm ? (<div className="err warn"><b>Remove your Halloween house?</b>Your pumpkin will disappear from the public map.
      <div className="stack"><button className="btn sec" onClick={() => setConfirm(false)}>KEEP MY PUMPKIN</button><button className="btn danger" onClick={onRemove}>REMOVE HOUSE</button></div></div>) : (
      <div className="stack">
        {mine.status !== 'removed' && <button className="btn pri" onClick={onEdit}>✏️ EDIT HOUSE</button>}
        {mine.status === 'approved' && <button className="btn sec" onClick={onShow}>📍 SHOW ON THE MAP</button>}
        {live && <button className="btn danger" onClick={() => setConfirm(true)}>REMOVE HOUSE</button>}
        {!live && regOpen && <button className="btn pri" onClick={onRegister}>🎃 REGISTER AGAIN</button>}
        <button className="btn ghost" onClick={onClose}>BACK TO THE MAP</button>
      </div>)}
  </>);
}

function Report({ house, addr, onClose, onSend }) {
  const [reason, setReason] = useState(REASONS[0]); const [note, setNote] = useState('');
  return (<>
    <div className="sh-top"><span className="eyebrow">🚩 Report a house</span><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
    <h2>Report {addr}</h2><p className="lead">An administrator will take a look. Reports are private.</p>
    {REASONS.map(r => <label className="chk" style={{ marginTop: 10 }} key={r}><input type="radio" name="rr" checked={reason === r} onChange={() => setReason(r)} /> <span>{r}</span></label>)}
    <label className="fld" htmlFor="rn">Anything else? (optional)</label>
    <textarea id="rn" className="inp" maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
    <div className="stack"><button className="btn pri" onClick={() => onSend(house, reason, note.trim())}>SEND REPORT</button><button className="btn ghost" onClick={onClose}>CANCEL</button></div>
  </>);
}
