import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { calculateMedicalExpiry, formatDate, getCurrentMonthKey, getMedicalLabel, getMedicalStatus, parsePayments, stringifyPayments } from '../utils'

function formatMonthLabel(value) {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return ''
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
}

function isMembershipPayment(payment) {
  const type = String(payment?.payment_type || '').trim().toLowerCase()
  return type === 'članarina' || type === 'clanarina' || type === 'membership'
}

function paymentIdentity(payment) {
  return [
    payment?.month_key || '',
    payment?.date || '',
    payment?.payment_type || '',
    payment?.amount || '',
    payment?.currency || '',
    payment?.paid ? '1' : '0',
    payment?.member_id || '',
  ].join('|')
}

function uniquePayments(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = paymentIdentity(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export function PlayerDetailView({ player, user, onBack }) {
  const [activeTab, setActiveTab] = useState('info')
  const [playerState, setPlayerState] = useState(player)
  const [payments, setPayments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [form, setForm] = useState({ amount: '', date: '', payment_type: 'Članarina', currency: 'RSD', paid: false })
  const [feedback, setFeedback] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', dob: '', pos: '', height: '', weight: '', medical_exam_date: '', medical_expiry_date: '', phone: '', parent_phone: '', email: '' })

  useEffect(() => {
    if (!player?.id) return
    setPlayerState(player)
    loadData(player)
  }, [player])

  async function loadData(targetPlayer = player) {
    const [playersRes, attendanceRes] = await Promise.all([
      supabase.from('players').select('*').eq('id', targetPlayer.id).single(),
      supabase.from('attendance').select('*').eq('player_id', targetPlayer.id).order('training_date'),
    ])
    const currentPlayer = playersRes.data || targetPlayer
    setPlayerState(currentPlayer)
    const nextPayments = await loadMemberPayments(currentPlayer)
    setPayments(nextPayments)
    setAttendance(attendanceRes.data || [])
  }

  async function loadMemberPayments(currentPlayer) {
    if (!currentPlayer) return []
    const memberId = currentPlayer.member_id
    if (!memberId) return parsePayments(currentPlayer.payments)

    const { data, error } = await supabase
      .from('players')
      .select('id, payments')
      .eq('member_id', memberId)

    if (error || !data?.length) {
      return parsePayments(currentPlayer.payments)
    }

    const merged = data.flatMap((row) => parsePayments(row.payments))
    return uniquePayments(merged)
  }

  async function persistPayments(nextPayments, currentPlayer = playerState || player) {
    const memberId = currentPlayer?.member_id
    if (!memberId) {
      return supabase.from('players').update({ payments: stringifyPayments(nextPayments) }).eq('id', currentPlayer.id)
    }

    const { data, error } = await supabase
      .from('players')
      .select('id')
      .eq('member_id', memberId)

    if (error || !data?.length) {
      return supabase.from('players').update({ payments: stringifyPayments(nextPayments) }).eq('id', currentPlayer.id)
    }

    const updates = data.map((row) => supabase.from('players').update({ payments: stringifyPayments(nextPayments) }).eq('id', row.id))
    const results = await Promise.all(updates)
    const failed = results.find((result) => result.error)
    return failed || { error: null }
  }

  async function addPayment(event) {
    event.preventDefault()
    const monthKey = form.date ? form.date.slice(0, 7) : getCurrentMonthKey()
    const paymentRecord = {
      month: formatMonthLabel(monthKey),
      month_key: monthKey,
      date: form.date || null,
      amount: form.amount,
      payment_type: form.payment_type,
      currency: form.currency,
      paid: form.paid,
      member_id: playerState?.member_id || playerState?.id || player?.id,
      group_id: playerState?.gid || player?.gid || null,
    }

    const normalizedExisting = payments.map((item) => ({
      ...item,
      month_key: item?.month_key || (item?.date ? String(item.date).slice(0, 7) : null),
      member_id: item?.member_id || playerState?.member_id || playerState?.id || player?.id,
    }))

    const next = isMembershipPayment(paymentRecord)
      ? normalizedExisting.filter((item) => !(isMembershipPayment(item) && String(item.month_key || '').slice(0, 7) === monthKey))
      : normalizedExisting

    const merged = uniquePayments([...next, paymentRecord])
    const { error } = await persistPayments(merged)
    if (!error) {
      setForm({ amount: '', date: '', payment_type: 'Članarina', currency: 'RSD', paid: false })
      setFeedback('Uplata je sačuvana.')
      loadData()
    } else {
      setFeedback('Nije uspelo čuvanje uplate.')
    }
  }

  async function togglePayment(index) {
    const next = payments.map((item, i) => i === index ? { ...item, paid: !item.paid } : item)
    await persistPayments(next)
    loadData()
  }

  async function deletePayment(index) {
    if (!window.confirm('Are you sure you want to delete this payment?')) return
    const next = payments.filter((_, itemIndex) => itemIndex !== index)
    const { error } = await persistPayments(next)
    if (!error) {
      setFeedback('Uplata je obrisana.')
      loadData()
    } else {
      setFeedback('Nije uspelo brisanje uplate.')
    }
  }

  function startEdit() {
    setEditForm({
      name: playerState?.name || '',
      dob: playerState?.dob || '',
      pos: playerState?.pos || '',
      height: playerState?.height || '',
      weight: playerState?.weight || '',
      medical_exam_date: playerState?.medical_exam_date || '',
      medical_expiry_date: playerState?.medical_expiry_date || calculateMedicalExpiry(playerState?.medical_exam_date || playerState?.medical || ''),
      phone: playerState?.phone || '',
      parent_phone: playerState?.parent_phone || '',
      email: playerState?.email || '',
    })
    setEditing(true)
  }

  function updateMedicalDates(value) {
    setEditForm((current) => ({
      ...current,
      medical_exam_date: value,
      medical_expiry_date: calculateMedicalExpiry(value),
    }))
  }

  async function saveEdit(event) {
    event.preventDefault()
    const payload = {
      name: editForm.name.trim(),
      dob: editForm.dob || null,
      pos: editForm.pos || null,
      height: editForm.height || null,
      weight: editForm.weight || null,
      medical_exam_date: editForm.medical_exam_date || null,
      medical_expiry_date: editForm.medical_expiry_date || null,
      medical: editForm.medical_expiry_date || null,
      phone: editForm.phone || null,
      parent_phone: editForm.parent_phone || null,
      email: editForm.email || null,
    }

    const fallbackPayload = {
      ...payload,
      medical_exam_date: undefined,
      medical_expiry_date: undefined,
      parent_phone: undefined,
    }

    let result = await supabase.from('players').update(payload).eq('id', player.id)
    if (result.error && (result.error.message?.includes('medical_exam_date') || result.error.message?.includes('medical_expiry_date') || result.error.message?.includes('parent_phone'))) {
      result = await supabase.from('players').update(fallbackPayload).eq('id', player.id)
    }

    if (!result.error) {
      setEditing(false)
      setFeedback('Podaci igrača su sačuvani.')
      loadData()
    } else {
      setFeedback('Nije uspelo čuvanje podataka igrača.')
    }
  }

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthItems = attendance.filter((item) => item.training_date?.startsWith(currentMonth))
    const fullSeason = attendance.length ? Math.round((attendance.filter((item) => item.status === 'present').length / attendance.length) * 100) : 0
    const monthPct = monthItems.length ? Math.round((monthItems.filter((item) => item.status === 'present').length / monthItems.length) * 100) : 0
    return { fullSeason, monthPct }
  }, [attendance])

  const medicalStatus = getMedicalStatus(playerState?.medical_expiry_date || playerState?.medical)
  const recentPayments = useMemo(() => [...payments].slice(-3).reverse(), [payments])
  const canEditPlayer = user?.role === 'admin' || user?.role === 'Administrator' || user?.role === 'superadmin' || user?.role === 'trener' || user?.role === 'coach' || user?.role === 'Coach'

  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{playerState?.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{playerState?.pos || '-'} • {playerState?.phone || '-'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEditPlayer ? <button onClick={startEdit} style={buttonStyle}>Izmeni</button> : null}
          <button onClick={onBack} style={buttonStyle}>← Nazad</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['info', 'payments', 'attendance'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...pill, ...(activeTab === tab ? activePill : {}) }}>{tab === 'info' ? 'Informacije' : tab === 'payments' ? 'Uplate' : 'Prisustva'}</button>
        ))}
      </div>

      {editing ? (
        <form onSubmit={saveEdit} style={{ display: 'grid', gap: 8, background: '#111827', borderRadius: 16, padding: 12 }}>
          <input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} placeholder="Ime i prezime" required style={inputStyle} />
          <input type="date" value={editForm.dob} onChange={(event) => setEditForm({ ...editForm, dob: event.target.value })} style={inputStyle} />
          <input value={editForm.pos} onChange={(event) => setEditForm({ ...editForm, pos: event.target.value })} placeholder="Pozicija" style={inputStyle} />
          <input value={editForm.height} onChange={(event) => setEditForm({ ...editForm, height: event.target.value })} placeholder="Visina" style={inputStyle} />
          <input value={editForm.weight} onChange={(event) => setEditForm({ ...editForm, weight: event.target.value })} placeholder="Težina" style={inputStyle} />
          <div style={{ color: '#f8fafc', fontWeight: 700, marginTop: 4 }}>Datum pregleda</div>
          <input type="date" value={editForm.medical_exam_date} onChange={(event) => updateMedicalDates(event.target.value)} style={inputStyle} />
          {editForm.medical_expiry_date ? <div style={{ color: '#fde68a', fontSize: 12, fontWeight: 700 }}>Datum isteka lekarskog: {formatDate(editForm.medical_expiry_date)}</div> : null}
          <input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} placeholder="Telefon igrača" style={inputStyle} />
          <input value={editForm.parent_phone} onChange={(event) => setEditForm({ ...editForm, parent_phone: event.target.value })} placeholder="Telefon roditelja" style={inputStyle} />
          <input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} placeholder="Email" style={inputStyle} />
          <button type="submit" style={buttonStyle}>Sačuvaj</button>
        </form>
      ) : null}

      {activeTab === 'info' && !editing ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 8 }}>Osnovni podaci</div>
            <div style={{ display: 'grid', gap: 6, color: '#cbd5e1', fontSize: 14 }}>
              <div>Datum rođenja: {formatDate(playerState?.dob)}</div>
              <div>Pozicija: {playerState?.pos || '-'}</div>
              <div>Visina: {playerState?.height || '-'} cm</div>
              <div>Težina: {playerState?.weight || '-'} kg</div>
              <div>Datum pregleda: {playerState?.medical_exam_date ? formatDate(playerState.medical_exam_date) : '-'}</div>
              <div style={{ color: medicalStatus === 'expired' ? '#fca5a5' : medicalStatus === 'soon' ? '#fde68a' : '#86efac' }}>
                Datum isteka lekarskog: {playerState?.medical_expiry_date ? formatDate(playerState.medical_expiry_date) : (playerState?.medical ? formatDate(playerState.medical) : '-')}
              </div>
              <div style={{ color: medicalStatus === 'expired' ? '#fca5a5' : medicalStatus === 'soon' ? '#fde68a' : '#86efac' }}>Medicinski: {getMedicalLabel(medicalStatus)}</div>
              <div>Telefon igrača: {playerState?.phone || '-'}</div>
              <div>Telefon roditelja: {playerState?.parent_phone || '-'}</div>
              <div>Email: {playerState?.email || '-'}</div>
            </div>
          </div>

          <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 8 }}>Poslednje uplate</div>
            {recentPayments.length ? recentPayments.map((payment, index) => (
              <div key={`${payment.month || payment.date}-${index}`} style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>
                {payment.date || payment.month || '-'} • {payment.amount || '-'} {payment.currency || 'RSD'} • {payment.paid ? 'Plaćeno' : 'Neplaćeno'}
              </div>
            )) : <div style={{ color: '#94a3b8', fontSize: 13 }}>Nema uplata.</div>}
            <button onClick={() => setActiveTab('payments')} style={{ ...buttonStyle, marginTop: 10 }}>Uplate</button>
          </div>
        </div>
      ) : null}

      {activeTab === 'payments' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {feedback ? <div style={{ color: '#fde68a', fontSize: 13 }}>{feedback}</div> : null}
          <form onSubmit={addPayment} style={{ display: 'grid', gap: 8, background: '#111827', borderRadius: 16, padding: 12 }}>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} style={inputStyle} />
            <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Iznos" style={inputStyle} />
            <select value={form.payment_type} onChange={(event) => setForm({ ...form, payment_type: event.target.value })} style={inputStyle}>
              <option value="Članarina">Članarina</option>
              <option value="Kamp">Kamp</option>
              <option value="Oprema">Oprema</option>
            </select>
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} style={inputStyle}>
              <option value="RSD">RSD</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
            <label style={{ color: '#cbd5e1', fontSize: 13 }}><input type="checkbox" checked={form.paid} onChange={() => setForm({ ...form, paid: !form.paid })} /> Plaćeno</label>
            <button type="submit" style={buttonStyle}>Dodaj uplatu</button>
          </form>
          {payments.map((payment, index) => (
            <div key={`${payment.month || payment.date}-${index}`} style={{ background: '#111827', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 700 }}>{payment.month || payment.date || '-'}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{payment.amount || '-'} {payment.currency || 'RSD'} • {payment.payment_type || 'Članarina'} • {payment.paid ? 'Plaćeno' : 'Neplaćeno'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => togglePayment(index)} style={payment.paid ? activeButton : inactiveButton}>{payment.paid ? '✓' : '✕'}</button>
                <button onClick={() => deletePayment(index)} style={dangerButton}>Obriši</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === 'attendance' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700 }}>Prisustvo</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Mesec: {stats.monthPct}% • Sezona: {stats.fullSeason}%</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const buttonStyle = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#ff9800',
  color: '#111827',
  fontWeight: 700,
  cursor: 'pointer',
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#f8fafc',
}

const pill = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
}

const activePill = {
  borderColor: '#ff9800',
  color: '#ff9800',
}

const activeButton = {
  border: 'none',
  borderRadius: 999,
  padding: '8px 10px',
  background: '#22c55e',
  color: '#fff',
  cursor: 'pointer',
}

const inactiveButton = {
  border: 'none',
  borderRadius: 999,
  padding: '8px 10px',
  background: '#ef4444',
  color: '#fff',
  cursor: 'pointer',
}

const dangerButton = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#ef4444',
  color: '#fff',
  cursor: 'pointer',
}
