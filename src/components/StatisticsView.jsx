import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getMedicalLabel, getMedicalStatus, isAdminRole } from '../utils'

export function StatisticsView({ user }) {
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [users, setUsers] = useState([])
  const [coachFormOpen, setCoachFormOpen] = useState(false)
  const [coachForm, setCoachForm] = useState({ name: '', username: '', password: '', group_ids: [] })
  const [coachSubmitting, setCoachSubmitting] = useState(false)
  const [coachMessage, setCoachMessage] = useState('')
  const [editingCoachId, setEditingCoachId] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [groupsRes, playersRes, attendanceRes, usersRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('players').select('*').order('name'),
      supabase.from('attendance').select('*'),
      supabase.from('users').select('*').order('name'),
    ])
    setGroups(groupsRes.data || [])
    setPlayers(playersRes.data || [])
    setAttendance(attendanceRes.data || [])
    setUsers(usersRes.data || [])
  }

  async function handleAddCoach(event) {
    event.preventDefault()
    setCoachSubmitting(true)
    setCoachMessage('')

    const payload = {
      name: coachForm.name.trim(),
      username: coachForm.username.trim(),
      password: coachForm.password,
      role: 'trener',
      group_ids: JSON.stringify(coachForm.group_ids),
    }

    let error
    if (editingCoachId) {
      ;({ error } = await supabase.from('users').update(payload).eq('id', editingCoachId))
    } else {
      ;({ error } = await supabase.from('users').insert([payload]))
    }

    if (error) {
      setCoachMessage(editingCoachId ? 'Nije uspelo uređivanje trenera.' : 'Nije uspelo dodavanje trenera.')
    } else {
      setCoachForm({ name: '', username: '', password: '', group_ids: [] })
      setCoachFormOpen(false)
      setEditingCoachId(null)
      setCoachMessage(editingCoachId ? 'Trener je uspešno izmenjen.' : 'Trener je uspešno dodat.')
      await loadData()
    }

    setCoachSubmitting(false)
  }

  function startEditCoach(coach) {
    setEditingCoachId(coach.id)
    let selectedGroupIds = []
    try {
      selectedGroupIds = Array.isArray(coach.group_ids) ? coach.group_ids : JSON.parse(coach.group_ids || '[]')
    } catch {
      selectedGroupIds = []
    }

    setCoachForm({
      name: coach.name || '',
      username: coach.username || '',
      password: coach.password || '',
      group_ids: selectedGroupIds,
    })
    setCoachFormOpen(true)
  }

  async function deleteCoach(coachId) {
    if (!window.confirm('Da li želite da obrišete ovog trenera?')) return
    const { error } = await supabase.from('users').delete().eq('id', coachId)
    if (!error) {
      setCoachMessage('Trener je obrisan.')
      await loadData()
    }
  }

  const visibleGroups = useMemo(() => {
    if (isAdminRole(user?.role)) return groups
    return groups.filter((group) => String(group.trener_id) === String(user?.id))
  }, [groups, user])

  const visiblePlayers = useMemo(() => {
    if (isAdminRole(user?.role)) return players
    const visibleGroupIds = new Set(visibleGroups.map((group) => String(group.id)))
    return players.filter((player) => visibleGroupIds.has(String(player.gid)))
  }, [players, visibleGroups, user])

  const stats = useMemo(() => {
    const medicalWarnings = visiblePlayers.map((player) => ({ ...player, status: getMedicalStatus(player.medical_expiry_date || player.medical) })).filter((player) => player.status !== 'ok')
    const overdueFees = visiblePlayers.filter((player) => {
      const payments = player.payments ? JSON.parse(player.payments) : []
      return payments.some((payment) => !payment.paid)
    })
    return {
      medicalWarnings,
      overdueFees,
      groupStats: visibleGroups.map((group) => {
        const groupPlayers = visiblePlayers.filter((player) => String(player.gid) === String(group.id))
        const groupAttendance = attendance.filter((item) => String(item.group_id) === String(group.id))
        const present = groupAttendance.filter((item) => item.status === 'present').length
        const total = groupAttendance.length
        return {
          ...group,
          present,
          total,
          percent: total ? Math.round((present / total) * 100) : 0,
          playerCount: groupPlayers.length,
        }
      }),
    }
  }, [attendance, visibleGroups, visiblePlayers])

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>Statistika</div>
      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Upozorenja za medicinske</div>
        {stats.medicalWarnings.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Nema upozorenja.</div> : stats.medicalWarnings.map((player) => (
          <div key={player.id} style={{ color: player.status === 'expired' ? '#fca5a5' : '#fde68a', marginTop: 8, fontWeight: 700 }}>{player.name} • {getMedicalLabel(player.status)}</div>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Pregled po grupama</div>
        {stats.groupStats.map((group) => (
          <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #334155' }}>
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{group.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{group.playerCount} igrača</div>
            </div>
            <div style={{ color: '#ff9800', fontWeight: 700 }}>{group.percent}%</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Neplaćene uplate</div>
        {stats.overdueFees.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Sve uplate su evidentirane.</div> : stats.overdueFees.map((player) => (
          <div key={player.id} style={{ color: '#fca5a5', marginTop: 8, fontWeight: 700 }}>{player.name}</div>
        ))}
      </div>

      {isAdminRole(user?.role) ? (
        <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#f8fafc' }}>Treneri</div>
            <button onClick={() => { setCoachFormOpen((value) => !value); if (!coachFormOpen) { setEditingCoachId(null); setCoachForm({ name: '', username: '', password: '', group_ids: [] }) } }} style={buttonStyle}>+ Add Coach</button>
          </div>

          {coachFormOpen ? (
            <form onSubmit={handleAddCoach} style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              <input value={coachForm.name} onChange={(event) => setCoachForm({ ...coachForm, name: event.target.value })} placeholder="Ime i prezime" required style={inputStyle} />
              <input value={coachForm.username} onChange={(event) => setCoachForm({ ...coachForm, username: event.target.value })} placeholder="Korisničko ime" required style={inputStyle} />
              <input value={coachForm.password} onChange={(event) => setCoachForm({ ...coachForm, password: event.target.value })} placeholder="Lozinka" required type="password" style={inputStyle} />
              <label style={{ color: '#f8fafc', fontWeight: 700 }}>Grupe</label>
              <select
                multiple
                value={coachForm.group_ids}
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions, (option) => option.value)
                  setCoachForm({ ...coachForm, group_ids: selected })
                }}
                style={{ ...inputStyle, minHeight: 96 }}
              >
                {groups.map((group) => (
                  <option key={group.id} value={String(group.id)}>{group.name}</option>
                ))}
              </select>
              <button type="submit" disabled={coachSubmitting} style={buttonStyle}>
                {coachSubmitting ? 'Dodavanje...' : editingCoachId ? 'Sačuvaj izmene' : 'Sačuvaj trenera'}
              </button>
            </form>
          ) : null}

          {coachMessage ? <div style={{ color: '#fde68a', marginBottom: 8, fontSize: 13 }}>{coachMessage}</div> : null}

          {users.filter((person) => person.role === 'trener').map((person) => (
            <div key={person.id} style={{ padding: '8px 0', color: '#cbd5e1', borderTop: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{person.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{person.username}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEditCoach(person)} style={smallButton}>Izmeni</button>
                  <button onClick={() => deleteCoach(person.id)} style={dangerButton}>Obriši</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Grupe: {person.group_ids || '[]'}</div>
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

const smallButton = {
  border: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  background: '#1f2937',
  color: '#f8fafc',
  cursor: 'pointer',
}

const dangerButton = {
  border: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  background: '#ef4444',
  color: '#fff',
  cursor: 'pointer',
}
