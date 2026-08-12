import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { calculateMedicalExpiry, formatDate, getMedicalLabel, getMedicalStatus } from '../utils'

export function GroupDetailView({ group, user, initialDate, onBack, onOpenPlayer }) {
  const [activeTab, setActiveTab] = useState('attendance')
  const [players, setPlayers] = useState([])
  const [trainings, setTrainings] = useState([])
  const [attendance, setAttendance] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [coachOptions, setCoachOptions] = useState([])
  const [form, setForm] = useState({
    name: '',
    dob: '',
    pos: '',
    height: '',
    weight: '',
    medical_exam_date: '',
    medical_expiry_date: '',
    phone: '',
    parent_phone: '',
    email: '',
  })
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().slice(0, 10))
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    loadData()
  }, [group])

  useEffect(() => {
    loadCoachOptions()
  }, [user])

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate)
    }
  }, [initialDate])

  async function loadData() {
    if (!group?.id) return
    const [playersRes, trainingsRes, attendanceRes] = await Promise.all([
      supabase.from('players').select('*').eq('gid', group.id).order('name'),
      supabase.from('trainings').select('*').eq('gid', group.id).order('date'),
      supabase.from('attendance').select('*').eq('group_id', group.id),
    ])
    setPlayers(playersRes.data || [])
    setTrainings(trainingsRes.data || [])
    setAttendance(attendanceRes.data || [])
  }

  async function loadCoachOptions() {
    if (user?.role !== 'admin' && user?.role !== 'Administrator' && user?.role !== 'superadmin') return
    const { data } = await supabase.from('users').select('*').order('name')
    setCoachOptions((data || []).filter((person) => person.role === 'trener' || person.role === 'coach' || person.role === 'Coach'))
  }

  function resetForm() {
    setForm({
      name: '',
      dob: '',
      pos: '',
      height: '',
      weight: '',
      medical_exam_date: '',
      medical_expiry_date: '',
      phone: '',
      parent_phone: '',
      email: '',
    })
    setShowAddForm(false)
  }

  function updateMedicalDates(value) {
    setForm((current) => ({
      ...current,
      medical_exam_date: value,
      medical_expiry_date: calculateMedicalExpiry(value),
    }))
  }

  async function handleAddPlayer(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setFeedback('Unesite ime igrača.')
      return
    }

    const payload = {
      gid: Number(group.id),
      name: form.name.trim(),
      dob: form.dob || null,
      pos: form.pos || null,
      height: form.height || null,
      weight: form.weight || null,
      medical_exam_date: form.medical_exam_date || null,
      medical_expiry_date: form.medical_expiry_date || null,
      medical: form.medical_expiry_date || null,
      phone: form.phone || null,
      parent_phone: form.parent_phone || null,
      email: form.email || null,
    }

    const fallbackPayload = {
      ...payload,
      medical_exam_date: undefined,
      medical_expiry_date: undefined,
      parent_phone: undefined,
    }

    let result = await supabase.from('players').insert([payload])
    if (result.error && (result.error.message?.includes('medical_exam_date') || result.error.message?.includes('medical_expiry_date') || result.error.message?.includes('parent_phone'))) {
      result = await supabase.from('players').insert([fallbackPayload])
    }

    if (!result.error) {
      resetForm()
      setFeedback('Igrač je uspešno dodat.')
      await loadData()
    } else {
      setFeedback('Nije uspelo čuvanje igrača.')
    }
  }

  async function handleDeletePlayer(playerId) {
    if (!window.confirm('Da li želite da obrišete igrača?')) return
    const { error } = await supabase.from('players').delete().eq('id', playerId)
    if (!error) {
      setFeedback('Igrač je obrisan.')
      loadData()
    }
  }

  async function updateGroupCoach(trenerId) {
    const previousCoachId = group?.trener_id || null
    const { error } = await supabase.from('groups').update({ trener_id: trenerId || null }).eq('id', group.id)
    if (!error) {
      if (previousCoachId && String(previousCoachId) !== String(trenerId || '')) {
        const { data: previousCoach } = await supabase.from('users').select('id, group_ids').eq('id', previousCoachId).single()
        const previousGroupIds = (previousCoach?.group_ids ? JSON.parse(previousCoach.group_ids) : []).map((value) => String(value)).filter((value) => String(value) !== String(group.id))
        await supabase.from('users').update({ group_ids: JSON.stringify(previousGroupIds) }).eq('id', previousCoachId)
      }

      if (trenerId) {
        const { data: assignedCoach } = await supabase.from('users').select('id, group_ids').eq('id', trenerId).single()
        const assignedGroupIds = new Set((assignedCoach?.group_ids ? JSON.parse(assignedCoach.group_ids) : []).map((value) => String(value)))
        assignedGroupIds.add(String(group.id))
        await supabase.from('users').update({ group_ids: JSON.stringify(Array.from(assignedGroupIds)) }).eq('id', trenerId)
      }

      setFeedback(trenerId ? 'Trener je dodeljen grupi.' : 'Trener je uklonjen iz grupe.')
      await loadData()
    } else {
      setFeedback('Nije uspelo ažuriranje trenera.')
    }
  }

  async function handleAttendance(playerId, status) {
    const payload = { player_id: playerId, training_date: selectedDate, group_id: group.id, status }
    const existing = attendance.find((item) => item.player_id === playerId && item.training_date === selectedDate)
    if (existing) {
      await supabase.from('attendance').update({ status }).eq('id', existing.id)
    } else {
      await supabase.from('attendance').insert([payload])
    }
    loadData()
  }

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    return players.map((player) => {
      const playerAttendance = attendance.filter((item) => item.player_id === player.id)
      const month = playerAttendance.filter((item) => item.training_date?.startsWith(currentMonth))
      return {
        ...player,
        attendancePct: playerAttendance.length ? Math.round((playerAttendance.filter((item) => item.status === 'present').length / playerAttendance.length) * 100) : 0,
        monthPct: month.length ? Math.round((month.filter((item) => item.status === 'present').length / month.length) * 100) : 0,
        medicalStatus: getMedicalStatus(player.medical_expiry_date || player.medical),
      }
    }).sort((a, b) => b.attendancePct - a.attendancePct)
  }, [attendance, players])

  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{group?.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{group?.uzrast} • {group?.pol}</div>
        </div>
        <button onClick={onBack} style={buttonStyle}>← Nazad</button>
      </div>

      {(user?.role === 'admin' || user?.role === 'Administrator' || user?.role === 'superadmin') ? (
        <div style={{ background: '#111827', borderRadius: 16, padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ color: '#f8fafc', fontWeight: 700 }}>Trener grupe</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={group?.trener_id || ''} onChange={(event) => updateGroupCoach(event.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 220 }}>
              <option value="">Bez trenera</option>
              {coachOptions.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
            </select>
            <button type="button" onClick={() => updateGroupCoach('')} style={secondaryButton}>Ukloni</button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['attendance', 'players', 'stats'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ ...pill, ...(activeTab === tab ? activePill : {}) }}>{tab === 'attendance' ? 'Prisustva' : tab === 'players' ? 'Igrači' : 'Statistika'}</button>
        ))}
      </div>

      {feedback ? <div style={{ color: '#fde68a', fontSize: 13 }}>{feedback}</div> : null}

      {activeTab === 'attendance' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: '#ff9800', fontWeight: 700, fontSize: 14 }}>Datum: {formatDate(selectedDate)}</div>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={inputStyle} />
          {trainings.filter((item) => item.date === selectedDate).length ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>{trainings.filter((item) => item.date === selectedDate).length} treninga za ovaj dan</div>
          ) : null}
          {players.map((player) => {
            const existing = attendance.find((item) => item.player_id === player.id && item.training_date === selectedDate)
            return (
              <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111827', borderRadius: 12, padding: 10 }}>
                <div onClick={() => onOpenPlayer(player)} style={{ color: '#f8fafc', cursor: 'pointer' }}>{player.name}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAttendance(player.id, 'present')} style={markButton(existing?.status === 'present' ? '#22c55e' : '#1f2937')}>✓</button>
                  <button onClick={() => handleAttendance(player.id, 'absent')} style={markButton(existing?.status === 'absent' ? '#ef4444' : '#1f2937')}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {activeTab === 'players' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#f8fafc', fontWeight: 700 }}>Igrači u grupi</div>
            <button onClick={() => setShowAddForm((value) => !value)} style={buttonStyle}>+ Add Player</button>
          </div>

          {showAddForm ? (
            <form onSubmit={handleAddPlayer} style={{ display: 'grid', gap: 8, background: '#111827', borderRadius: 16, padding: 12 }}>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ime i prezime" required style={inputStyle} />
              <input type="date" value={form.dob} onChange={(event) => setForm({ ...form, dob: event.target.value })} style={inputStyle} />
              <input value={form.pos} onChange={(event) => setForm({ ...form, pos: event.target.value })} placeholder="Pozicija" style={inputStyle} />
              <input value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} placeholder="Težina" style={inputStyle} />
              <input value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} placeholder="Visina" style={inputStyle} />
              <input type="date" value={form.medical_exam_date} onChange={(event) => updateMedicalDates(event.target.value)} style={inputStyle} />
              {form.medical_expiry_date ? <div style={{ color: '#fde68a', fontSize: 12 }}>Ističe: {formatDate(form.medical_expiry_date)}</div> : null}
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Telefon igrača" style={inputStyle} />
              <input value={form.parent_phone} onChange={(event) => setForm({ ...form, parent_phone: event.target.value })} placeholder="Telefon roditelja" style={inputStyle} />
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={buttonStyle}>Dodaj igrača</button>
                <button type="button" onClick={resetForm} style={secondaryButton}>Otkaži</button>
              </div>
            </form>
          ) : null}

          {players.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Nema igrača u ovoj grupi.</div> : players.map((player) => {
              const medicalExpiry = player.medical_expiry_date || calculateMedicalExpiry(player.medical_exam_date || player.medical || '')
              const medicalStatus = getMedicalStatus(medicalExpiry)
            return (
              <div key={player.id} style={{ background: '#111827', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div onClick={() => onOpenPlayer(player)} style={{ color: '#f8fafc', cursor: 'pointer', flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{player.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{player.dob ? `${formatDate(player.dob)} • ` : ''}{player.pos || '-'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#cbd5e1', fontSize: 11 }}>Pregled: {player.medical_exam_date ? formatDate(player.medical_exam_date) : '-'}</div>
                      <div style={{ color: medicalStatus === 'expired' ? '#fca5a5' : medicalStatus === 'soon' ? '#fde68a' : '#86efac', fontSize: 11 }}>Ističe: {formatDate(medicalExpiry)}</div>
                    </div>
                    <button onClick={() => handleDeletePlayer(player.id)} style={dangerButton}>Obriši</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {activeTab === 'stats' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {stats.map((player) => (
            <div key={player.id} style={{ background: '#111827', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#f8fafc', fontWeight: 700 }}>{player.name}</div>
                <div style={{ color: '#ff9800', fontWeight: 700 }}>{player.attendancePct}%</div>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Mesec: {player.monthPct}% • Medicinski: {getMedicalLabel(player.medicalStatus)}</div>
            </div>
          ))}
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

const markButton = (background) => ({
  border: 'none',
  width: 36,
  height: 36,
  borderRadius: 999,
  background,
  color: '#fff',
  cursor: 'pointer',
})

const secondaryButton = {
  border: '1px solid #475569',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#0f172a',
  color: '#f8fafc',
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
