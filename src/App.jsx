import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './style.css'

const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const PER = { matin: 'Matin', 'apres-midi': 'Après-midi' }
const PO = { matin: 0, 'apres-midi': 1 }
const MAX = 3
const REC = { none: 'Une seule fois', '2weeks': 'Toutes les 2 semaines', monthly: 'Tous les mois' }
const ST = { demande: 'En attente', confirme: 'Confirmé', refuse: 'Refusé', fait: 'Fait', annule: 'Annulé' }

export default function App() {
  const isAdmin = () => location.hash.startsWith('#/admin')
  const [admin, setAdmin] = useState(isAdmin())
  useEffect(() => {
    const f = () => setAdmin(isAdmin())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return <><header><h1>CleanNet Camions</h1><div className="lane" /></header><main>{admin ? <Admin /> : <Client />}</main></>
}

/* ---------- Côté client pro ---------- */
function Client() {
  const [code, setCode] = useState(() => { try { return localStorage.getItem('cn_code') || '' } catch { return '' } })
  const [me, setMe] = useState(null)
  const [err, setErr] = useState('')
  async function login(c) {
    setErr('')
    const { data, error } = await supabase.rpc('client_login', { p_code: c.trim() })
    if (error || !data) { setErr('Code inconnu. Vérifiez le code reçu de CleanNet.'); return }
    try { localStorage.setItem('cn_code', c.trim()) } catch {}
    setMe(data)
  }
  useEffect(() => { if (code) login(code) }, [])
  if (!me) return (
    <form className="card" onSubmit={e => { e.preventDefault(); login(code) }}>
      <h2>Accès client</h2>
      <label>Votre code d'accès<input value={code} onChange={e => setCode(e.target.value)} autoFocus /></label>
      {err && <p className="err">{err}</p>}
      <button>Ouvrir mon planning</button>
    </form>)
  const out = () => { try { localStorage.removeItem('cn_code') } catch {} ; setCode(''); setMe(null) }
  return <ClientHome me={me} code={code.trim()} out={out} reload={() => login(code)} />
}

function ClientHome({ me, code, out, reload }) {
  const [np, setNp] = useState({ plate: '', type: '' }), [tm, setTm] = useState('')
  const [slots, setSlots] = useState([]), [bk, setBk] = useState([]), [msg, setMsg] = useState('')
  const [f, setF] = useState({ trucks: [], slot: '', place: '', rec: 'none', notes: '' })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const full = f.trucks.length > MAX
  const opts = full ? slots.filter(s => s.period === 'matin' && slots.some(o => o.day === s.day && o.period === 'apres-midi')) : slots
  const load = useCallback(async () => {
    setSlots((await supabase.rpc('client_slots', { p_code: code })).data || [])
    setBk((await supabase.rpc('client_bookings', { p_code: code })).data || [])
  }, [code])
  useEffect(() => { load() }, [load])
  async function addTruck(e) {
    e.preventDefault(); setTm('')
    const { error } = await supabase.rpc('client_add_truck', { p_code: code, p_plate: np.plate, p_type: np.type })
    if (error) { setTm('Impossible d’ajouter ce camion (plaque déjà enregistrée ?).'); return }
    setNp({ plate: '', type: '' }); reload()
  }
  async function book(e) {
    e.preventDefault(); setMsg('')
    if (!f.trucks.length) { setMsg('err:Choisissez au moins un camion.'); return }
    const { error } = await supabase.rpc('client_book', { p_code: code, p_trucks: f.trucks, p_slot: f.slot, p_place: f.place, p_rec: f.rec, p_notes: f.notes })
    if (error) { setMsg('err:Ce créneau vient d’être pris. Choisissez-en un autre.'); load(); return }
    setMsg('ok:Demande envoyée. CleanNet va la confirmer.'); setF({ ...f, trucks: [], slot: '', notes: '' }); load()
  }
  const cancel = async id => { await supabase.rpc('client_cancel', { p_code: code, p_booking: id }); load() }
  return <>
    <div className="row"><h2>{me.name}</h2><button className="ghost sm" onClick={out}>Changer de compte</button></div>
    <form className="card" onSubmit={addTruck}>
      <h3>Mes camions</h3>
      {me.trucks.map(t => <div key={t.id}><span className="plate">{t.plate}</span> {t.type}</div>)}
      <div className="row"><input required placeholder="Plaque (ex. AB-123-CD)" value={np.plate} onChange={e => setNp({ ...np, plate: e.target.value })} /><input placeholder="Type (porteur, semi…)" value={np.type} onChange={e => setNp({ ...np, type: e.target.value })} /><button className="sm">Ajouter</button></div>
      {tm && <p className="err">{tm}</p>}
    </form>
    <form className="card" onSubmit={book}>
      <h3>Planifier un nettoyage</h3>
      {!me.trucks.length ? <p>Ajoutez d’abord un camion dans « Mes camions » ci-dessus.</p>
        : !slots.length ? <p>Aucun créneau disponible pour le moment. Contactez CleanNet.</p> : <>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}><legend style={{ fontWeight: 500 }}>Camions à nettoyer</legend>{me.trucks.map(t => <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" checked={f.trucks.includes(t.id)} onChange={() => setF({ ...f, slot: '', trucks: f.trucks.includes(t.id) ? f.trucks.filter(x => x !== t.id) : [...f.trucks, t.id] })} /><span className="plate">{t.plate}</span> {t.type}</label>)}</fieldset>
        <p className="tag" style={{ margin: 0 }}>Jusqu’à {MAX} camions par demi-journée. Au-delà, une journée entière est réservée.</p>
        <label>{full ? 'Journée' : 'Demi-journée'}<select required value={f.slot} onChange={set('slot')}><option value="">Choisir une demi-journée…</option>{opts.map(s => <option key={s.id} value={s.id}>{fmtDay(s.day)} – {full ? 'Journée entière' : PER[s.period]}</option>)}</select></label>
        {full && !opts.length && <p className="err" style={{ margin: 0 }}>Aucune journée entière disponible pour le moment. Contactez CleanNet.</p>}
        <label>Lieu d’intervention<input required value={f.place} onChange={set('place')} placeholder="Adresse du dépôt ou du parking" /></label>
        <label>Fréquence<select value={f.rec} onChange={set('rec')}>{Object.entries(REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Remarques<textarea rows="2" value={f.notes} onChange={set('notes')} /></label>
        <button>Envoyer la demande</button></>}
      {msg && <p className={msg.startsWith('ok') ? 'ok' : 'err'}>{msg.slice(msg.indexOf(':') + 1)}</p>}
    </form>
    <h3>Mes nettoyages</h3>
    {!bk.length && <p className="tag">Aucune demande pour le moment.</p>}
    {bk.map(b => <div className="item" key={b.id}>
      <div className="row"><strong>{fmtDay(b.day)} – {b.full_day ? 'Journée entière' : PER[b.period]}</strong><span>{ST[b.status]}</span></div>
      <div className="tag">{b.plates.map(p => <span key={p} className="plate" style={{ marginRight: 4 }}>{p}</span>)} {b.place} · {REC[b.recurrence]}</div>
      {['demande', 'confirme'].includes(b.status) && <button className="ghost sm" onClick={() => cancel(b.id)}>Annuler</button>}
    </div>)}
  </>
}

/* ---------- Côté admin (toi) ---------- */
function Admin() {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setOk(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setOk(!!s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (ok === null) return null
  return ok ? <AdminHome /> : <Login />
}

function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('')
  async function go(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) setErr('Erreur : ' + error.message)
  }
  return <form className="card" onSubmit={go}><h2>Connexion admin</h2>
    <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Mot de passe<input type="password" value={pw} onChange={e => setPw(e.target.value)} /></label>
    {err && <p className="err">{err}</p>}<button>Se connecter</button></form>
}

function AdminHome() {
  const [tab, setTab] = useState('res')
  const T = [['res', 'Réservations'], ['slots', 'Créneaux'], ['cl', 'Clients']]
  return <>
    <nav>{T.map(([k, l]) => <button key={k} className={tab === k ? 'on sm' : 'ghost sm'} onClick={() => setTab(k)}>{l}</button>)}
      <button className="ghost sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button></nav>
    {tab === 'res' && <Bookings />}{tab === 'slots' && <Slots />}{tab === 'cl' && <Clients />}
  </>
}

function Bookings() {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*, clients(name), booking_trucks(truck_id, trucks(plate)), slots(day,period)').neq('status', 'annule').eq('is_extra', false)
    setRows((data || []).sort((a, b) => (a.slots.day + PO[a.slots.period]).localeCompare(b.slots.day + PO[b.slots.period])))
  }, [])
  useEffect(() => { load() }, [load])
  const setSt = async (b, status) => { await supabase.from('bookings').update({ status }).eq('group_id', b.group_id); load() }
  async function slotFor(day, period) {
    const { data } = await supabase.from('slots').select('id').eq('day', day).eq('period', period).maybeSingle()
    if (data) return data.id
    const { data: n, error } = await supabase.from('slots').insert({ day, period }).select().single()
    if (error) throw error
    return n.id
  }
  async function repeat(b) {
    const d = new Date(b.slots.day + 'T12:00:00')
    b.recurrence === '2weeks' ? d.setDate(d.getDate() + 14) : d.setMonth(d.getMonth() + 1)
    const day = d.toISOString().slice(0, 10)
    try {
      const ids = []
      for (const p of b.full_day ? ['matin', 'apres-midi'] : [b.slots.period]) ids.push(await slotFor(day, p))
      const base = { client_id: b.client_id, place: b.place, status: 'confirme', full_day: b.full_day }
      const { data: nb, error } = await supabase.from('bookings').insert({ ...base, slot_id: ids[0], recurrence: b.recurrence }).select().single()
      if (error) throw error
      if (b.full_day) await supabase.from('bookings').insert({ ...base, slot_id: ids[1], recurrence: 'none', group_id: nb.group_id, is_extra: true })
      await supabase.from('booking_trucks').insert(b.booking_trucks.map(x => ({ booking_id: nb.id, truck_id: x.truck_id })))
      await supabase.from('bookings').update({ recurrence: 'none' }).eq('id', b.id)
      load()
    } catch (e) { alert('Cette date n’est pas disponible : ' + e.message) }
  }
  return <>{!rows.length && <p className="tag">Aucune réservation.</p>}
    {rows.map(b => <div className="item" key={b.id}>
      <div className="row"><strong>{fmtDay(b.slots.day)} – {b.full_day ? 'Journée entière' : PER[b.slots.period]}</strong><span>{ST[b.status]}</span></div>
      <div>{b.clients?.name} · {b.booking_trucks.map(x => <span key={x.truck_id} className="plate" style={{ marginRight: 4 }}>{x.trucks?.plate}</span>)}</div>
      <div className="tag">{b.place} · {REC[b.recurrence]}{b.notes ? ' · ' + b.notes : ''}</div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        {b.status === 'demande' && <><button className="sm" onClick={() => setSt(b, 'confirme')}>Confirmer</button><button className="ghost sm" onClick={() => setSt(b, 'refuse')}>Refuser</button></>}
        {b.status === 'confirme' && <button className="sm" onClick={() => setSt(b, 'fait')}>Marquer fait</button>}
        {['confirme', 'fait'].includes(b.status) && b.recurrence !== 'none' && <button className="ghost sm" onClick={() => repeat(b)}>Planifier la suivante</button>}
      </div></div>)}</>
}

function Slots() {
  const [rows, setRows] = useState([]), [f, setF] = useState({ day: '', period: 'matin' })
  const load = useCallback(async () => {
    const { data } = await supabase.from('slots').select('*, bookings(status)').gte('day', new Date().toISOString().slice(0, 10)).order('day')
    setRows((data || []).sort((a, b) => (a.day + PO[a.period]).localeCompare(b.day + PO[b.period])))
  }, [])
  useEffect(() => { load() }, [load])
  async function add(e) {
    e.preventDefault()
    const per = f.period === 'journee' ? ['matin', 'apres-midi'] : [f.period]
    const { error } = await supabase.from('slots').insert(per.map(p => ({ day: f.day, period: p })))
    if (error) alert('Cette demi-journée existe déjà.')
    load()
  }
  const taken = s => s.bookings.some(b => ['demande', 'confirme'].includes(b.status))
  return <>
    <form className="card" onSubmit={add}><h3>Ajouter une demi-journée disponible</h3>
      <label>Jour<input type="date" required value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></label>
      <label>Période<select value={f.period} onChange={e => setF({ ...f, period: e.target.value })}><option value="matin">Matin</option><option value="apres-midi">Après-midi</option><option value="journee">Journée entière</option></select></label>
      <button>Ajouter</button></form>
    {rows.map(s => <div className="item" key={s.id}><div className="row">
      <span>{fmtDay(s.day)} – {PER[s.period]}</span>
      {taken(s) ? <span className="tag">Réservé</span> : <button className="ghost sm" onClick={async () => { await supabase.from('slots').delete().eq('id', s.id); load() }}>Supprimer</button>}
    </div></div>)}</>
}

function Clients() {
  const [rows, setRows] = useState([]), [n, setN] = useState(''), [tp, setTp] = useState({})
  const load = useCallback(async () => { setRows((await supabase.from('clients').select('*, trucks(*)').order('name')).data || []) }, [])
  useEffect(() => { load() }, [load])
  async function add(e) {
    e.preventDefault()
    await supabase.from('clients').insert({ name: n, code: Math.random().toString(36).slice(2, 8).toUpperCase() }); setN(''); load()
  }
  async function delClient(c) {
    if (!confirm(`Supprimer ${c.name} ? Ses camions et ses réservations seront supprimés. Cette action est définitive.`)) return
    const { error } = await supabase.from('clients').delete().eq('id', c.id)
    if (error) alert('Suppression impossible : ' + error.message)
    load()
  }
  async function addTruck(c) {
    const t = tp[c.id]; if (!t?.plate) return
    await supabase.from('trucks').insert({ client_id: c.id, plate: t.plate.toUpperCase(), type: t.type || null }); setTp({ ...tp, [c.id]: {} }); load()
  }
  return <>
    <form className="card" onSubmit={add}><h3>Nouveau client pro</h3>
      <label>Nom de l’entreprise<input required value={n} onChange={e => setN(e.target.value)} /></label><button>Créer le client</button></form>
    {rows.map(c => <div className="card" key={c.id}>
      <div className="row"><h3>{c.name}</h3><span>Code : <strong>{c.code}</strong></span></div>
      {c.trucks.map(t => <div key={t.id} className="row"><span><span className="plate">{t.plate}</span> {t.type}</span>
        <button className="ghost sm" onClick={async () => { await supabase.from('trucks').delete().eq('id', t.id); load() }}>Retirer</button></div>)}
      <div className="row"><input placeholder="Immatriculation" value={tp[c.id]?.plate || ''} onChange={e => setTp({ ...tp, [c.id]: { ...tp[c.id], plate: e.target.value } })} />
        <input placeholder="Type (porteur, semi…)" value={tp[c.id]?.type || ''} onChange={e => setTp({ ...tp, [c.id]: { ...tp[c.id], type: e.target.value } })} />
        <button className="sm" onClick={() => addTruck(c)}>Ajouter le camion</button></div>
      <div><button className="ghost sm" style={{ color: '#B3261E' }} onClick={() => delClient(c)}>Supprimer le client</button></div>
    </div>)}</>
}
