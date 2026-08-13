import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
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
  const [statsMonth, setStatsMonth] = useState((initialDate || new Date().toISOString().slice(0, 10)).slice(0, 7))
  const [trainingNote, setTrainingNote] = useState('')
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState(null)
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
      setStatsMonth(initialDate.slice(0, 7))
    }
  }, [initialDate])

  useEffect(() => {
    const training = trainings.find((item) => item.date === selectedDate)
    setTrainingNote(training?.note || '')
  }, [selectedDate, trainings])

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

    if (!window.confirm(`Are you sure you want to add ${form.name.trim()} to this group?`)) {
      return
    }

    const payload = {
      gid: group.id,
      name: form.name.trim(),
      dob: form.dob || null,
      pos: form.pos || null,
      height: form.height || null,
      weight: form.weight || null,
      medical: form.medical_expiry_date || null,
      phone: form.phone || null,
      email: form.email || null,
    }

    const { error } = await supabase.from('players').insert([payload])

    if (!error) {
      resetForm()
      setFeedback('Igrač je uspešno dodat.')
      await loadData()
    } else {
      console.error('Add player failed:', error)
      setFeedback(`Nije uspelo čuvanje igrača. (${error.message || error.code || 'nepoznata greška'})`)
    }
  }

  async function handleDeletePlayer(player) {
    if (!window.confirm(`Are you sure you want to remove ${player.name} from this group?`)) return
    const playerId = player.id
    const { error } = await supabase.from('players').delete().eq('id', playerId)
    if (!error) {
      setFeedback('Igrač je obrisan.')
      loadData()
    }
  }

  async function updateGroupCoach(trenerId) {
    const selectedCoach = coachOptions.find((item) => String(item.id) === String(trenerId))
    if (trenerId) {
      const confirmed = window.confirm(`Are you sure you want to assign ${selectedCoach?.name || 'this coach'} to ${group?.name || 'this group'}?`)
      if (!confirmed) return
    }

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

  async function handleSaveTrainingNote() {
    const training = trainings.find((item) => item.date === selectedDate)
    if (training) {
      const { error } = await supabase.from('trainings').update({ note: trainingNote || null }).eq('id', training.id)
      if (error) {
        setFeedback('Nije uspelo čuvanje napomene treninga.')
        return
      }
    } else {
      const { error } = await supabase.from('trainings').insert([{
        gid: Number(group.id),
        gname: group?.name || '',
        uzrast: group?.uzrast || null,
        kind: 'trening',
        date: selectedDate,
        note: trainingNote || null,
      }])
      if (error) {
        setFeedback('Nije uspelo čuvanje napomene treninga.')
        return
      }
    }
    setFeedback('Napomena treninga je sačuvana.')
    await loadData()
  }

  function getMonthDates(monthKey) {
    return trainings
      .filter((item) => String(item.date || '').startsWith(monthKey))
      .map((item) => item.date)
      .filter(Boolean)
      .sort()
      .filter((date, index, array) => array.indexOf(date) === index)
  }

  function getPlayerMonthRecord(player, monthKey) {
    const monthDates = getMonthDates(monthKey)
    const playerAttendance = attendance.filter((item) => item.player_id === player.id && String(item.training_date || '').startsWith(monthKey))
    const byDate = new Map(playerAttendance.map((item) => [item.training_date, item.status]))
    const presentCount = monthDates.filter((date) => byDate.get(date) === 'present').length
    const absentCount = monthDates.filter((date) => byDate.get(date) === 'absent').length
    const percentage = monthDates.length ? Math.round((presentCount / monthDates.length) * 100) : 0
    return { monthDates, byDate, presentCount, absentCount, percentage }
  }

  function exportMonthlyAttendance() {
    const monthDates = getMonthDates(statsMonth)
    const rows = players.map((player) => {
      const record = getPlayerMonthRecord(player, statsMonth)
      const row = {
        Igrac: player.name,
      }
      monthDates.forEach((date) => {
        const status = record.byDate.get(date)
        row[formatDate(date)] = status === 'present' ? '✓' : status === 'absent' ? '✕' : ''
      })
      row['Prisutno'] = record.presentCount
      row['Odsutno'] = record.absentCount
      row['Procenat'] = `${record.percentage}%`
      return row
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
    const safeGroupName = String(group?.name || 'group').replace(/[^a-zA-Z0-9_-]/g, '_')
    XLSX.writeFile(workbook, `${safeGroupName}_${statsMonth}_attendance.xlsx`)
  }

  const stats = useMemo(() => {
    const currentMonth = statsMonth
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
  }, [attendance, players, statsMonth])

  const selectedStatsPlayer = players.find((player) => player.id === selectedStatsPlayerId) || null
  const selectedStatsRecord = selectedStatsPlayer ? getPlayerMonthRecord(selectedStatsPlayer, statsMonth) : null

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
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>Napomena</label>
            <input value={trainingNote} onChange={(event) => setTrainingNote(event.target.value)} placeholder="Napomena" style={inputStyle} />
            <button type="button" onClick={handleSaveTrainingNote} style={buttonStyle}>Sačuvaj napomenu</button>
          </div>
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
                    <button onClick={() => handleDeletePlayer(player)} style={dangerButton}>Obriši</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {activeTab === 'stats' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={statsMonth} onChange={(event) => setStatsMonth(event.target.value)} style={inputStyle} />
            <button type="button" onClick={exportMonthlyAttendance} style={buttonStyle}>Export Excel</button>
          </div>
          {stats.map((player) => (
            <button key={player.id} onClick={() => setSelectedStatsPlayerId(player.id)} style={{ background: '#111827', border: '1px solid #334155', borderRadius: 12, padding: 12, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#f8fafc', fontWeight: 700 }}>{player.name}</div>
                <div style={{ color: '#ff9800', fontWeight: 700 }}>{player.attendancePct}%</div>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Mesec: {player.monthPct}% • Medicinski: {getMedicalLabel(player.medicalStatus)}</div>
            </button>
          ))}

          {selectedStatsPlayer && selectedStatsRecord ? (
            <div style={{ background: '#111827', borderRadius: 12, padding: 12 }}>
              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{selectedStatsPlayer.name} • {statsMonth}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Prisutno: {selectedStatsRecord.presentCount} • Odsutno: {selectedStatsRecord.absentCount} • Procenat: {selectedStatsRecord.percentage}%</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {selectedStatsRecord.monthDates.map((date) => {
                  const status = selectedStatsRecord.byDate.get(date)
                  const label = status === 'present' ? 'present' : status === 'absent' ? 'absent' : 'no record'
                  return <div key={date} style={{ color: '#cbd5e1', fontSize: 13 }}>{formatDate(date)} • {label}</div>
                })}
                {selectedStatsRecord.monthDates.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Nema treninga za izabrani mesec.</div> : null}
              </div>
            </div>
          ) : null}
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
