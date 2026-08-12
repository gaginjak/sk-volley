import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getCurrentMonthKey, getMedicalLabel, getMedicalStatus, isAdminRole, parseGroupIds, parsePayments } from '../utils'

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function isMembershipPayment(payment) {
  const type = String(payment?.payment_type || '').trim().toLowerCase()
  return type === 'članarina' || type === 'clanarina' || type === 'membership'
}

function getPaymentMonth(payment) {
  if (payment?.date) return String(payment.date).slice(0, 7)
  if (payment?.month_key) return String(payment.month_key).slice(0, 7)
  return ''
}

function memberKey(player) {
  return player?.member_id ? `member:${player.member_id}` : `player:${player.id}`
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

function mergeDistinctPayments(items) {
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

export function StatisticsView({ user, onOpenGroup, onOpenPlayer, onOpenCoach }) {
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

    const playersChannel = supabase.channel('statistics-players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadData)
      .subscribe()
    const groupsChannel = supabase.channel('statistics-groups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, loadData)
      .subscribe()
    const usersChannel = supabase.channel('statistics-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadData)
      .subscribe()
    const attendanceChannel = supabase.channel('statistics-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, loadData)
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(groupsChannel)
      supabase.removeChannel(usersChannel)
      supabase.removeChannel(attendanceChannel)
    }
  }, [user?.id, user?.role, user?.group_ids])

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

    const selectedGroupIds = coachForm.group_ids.map((value) => String(value))

    const payload = {
      name: coachForm.name.trim(),
      username: coachForm.username.trim(),
      password: coachForm.password,
      role: 'trener',
      group_ids: JSON.stringify(selectedGroupIds),
    }

    let error
    let coachId = editingCoachId
    if (editingCoachId) {
      ;({ error } = await supabase.from('users').update(payload).eq('id', editingCoachId))
    } else {
      const response = await supabase.from('users').insert([payload]).select('id')
      error = response.error
      coachId = response.data?.[0]?.id
    }

    if (!error && coachId) {
      const previousCoach = editingCoachId ? users.find((person) => String(person.id) === String(editingCoachId)) : null
      const previousGroupIds = parseGroupIds(previousCoach?.group_ids)
      const removedGroupIds = previousGroupIds.filter((groupId) => !selectedGroupIds.includes(String(groupId)))

      await Promise.all(selectedGroupIds.map((groupId) => supabase.from('groups').update({ trener_id: coachId }).eq('id', groupId)))
      await Promise.all(removedGroupIds.map((groupId) => supabase.from('groups').update({ trener_id: null }).eq('id', groupId)))

      await supabase.from('users').update({ group_ids: JSON.stringify(selectedGroupIds) }).eq('id', coachId)
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
    const coach = users.find((person) => String(person.id) === String(coachId))
    const groupIds = parseGroupIds(coach?.group_ids)
    await Promise.all(groupIds.map((groupId) => supabase.from('groups').update({ trener_id: null }).eq('id', groupId)))
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
    const currentMonth = getCurrentMonthKey()
    const members = new Map()

    for (const player of visiblePlayers) {
      const key = memberKey(player)
      const existing = members.get(key)
      const playerPayments = parsePayments(player.payments)
      const normalized = playerPayments.map((payment) => ({
        ...payment,
        month_key: payment?.month_key || (payment?.date ? String(payment.date).slice(0, 7) : null),
        member_id: payment?.member_id || player?.member_id || player?.id,
        group_id: payment?.group_id || player?.gid || null,
      }))

      if (!existing) {
        members.set(key, {
          representative: player,
          groups: new Set([String(player.gid)]),
          payments: normalized,
        })
      } else {
        existing.groups.add(String(player.gid))
        existing.payments = mergeDistinctPayments([...existing.payments, ...normalized])
      }
    }

    const memberEntries = Array.from(members.values())

    const unpaidMemberships = memberEntries.filter((entry) => {
      return !entry.payments.some((payment) => {
        const paymentMonth = getPaymentMonth(payment)
        return payment?.paid && isMembershipPayment(payment) && paymentMonth === currentMonth
      })
    })

    const collectedByGroup = new Map()
    let clubTotal = 0
    for (const entry of memberEntries) {
      for (const payment of entry.payments) {
        if (!payment?.paid || !isMembershipPayment(payment)) continue
        const amount = toNumber(payment.amount)
        if (!amount) continue
        const key = String(payment.group_id || entry.representative.gid)
        const previous = collectedByGroup.get(key) || 0
        collectedByGroup.set(key, previous + amount)
        clubTotal += amount
      }
    }

    const collectedPerGroup = visibleGroups.map((group) => ({
      id: group.id,
      name: group.name,
      total: Math.round((collectedByGroup.get(String(group.id)) || 0) * 100) / 100,
    }))

    return {
      medicalWarnings,
      unpaidMemberships,
      collectedPerGroup,
      clubTotal: Math.round(clubTotal * 100) / 100,
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
          <button key={player.id} onClick={() => onOpenPlayer?.(player, 'statistics')} style={{ border: 'none', background: 'transparent', color: player.status === 'expired' ? '#fca5a5' : '#fde68a', marginTop: 8, fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: 0 }}>{player.name} • {getMedicalLabel(player.status)}</button>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Pregled po grupama</div>
        {stats.groupStats.map((group) => (
          <button key={group.id} onClick={() => onOpenGroup?.(group, 'statistics')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #334155', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0, background: 'transparent', cursor: 'pointer' }}>
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700 }}>{group.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{group.playerCount} igrača</div>
            </div>
            <div style={{ color: '#ff9800', fontWeight: 700 }}>{group.percent}%</div>
          </button>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Neplaćena članarina za tekući mesec</div>
        {stats.unpaidMemberships.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Svi članovi su izmirili članarinu za ovaj mesec.</div> : stats.unpaidMemberships.map((entry) => {
          const groupNames = Array.from(entry.groups)
            .map((groupId) => groups.find((item) => String(item.id) === String(groupId))?.name)
            .filter(Boolean)
          return <button key={memberKey(entry.representative)} onClick={() => onOpenPlayer?.(entry.representative, 'statistics')} style={{ border: 'none', background: 'transparent', color: '#fca5a5', marginTop: 8, fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: 0 }}>{entry.representative.name} • {groupNames.join(', ') || 'Nepoznata grupa'}</button>
        })}
      </div>

      {isAdminRole(user?.role) ? (
        <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
          <div style={{ fontWeight: 700, color: '#f8fafc' }}>Ukupno naplaćene članarine (RSD)</div>
          {stats.collectedPerGroup.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#cbd5e1' }}>
              <div>{item.name}</div>
              <div style={{ fontWeight: 700 }}>{item.total.toLocaleString('sr-RS')} RSD</div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #334155', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', color: '#ff9800', fontWeight: 800 }}>
            <div>Ukupno klub</div>
            <div>{stats.clubTotal.toLocaleString('sr-RS')} RSD</div>
          </div>
        </div>
      ) : null}

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

          {users.filter((person) => person.role === 'trener' || person.role === 'coach' || person.role === 'Coach').map((person) => (
            <div key={person.id} style={{ padding: '8px 0', color: '#cbd5e1', borderTop: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => onOpenCoach?.(person)} style={{ border: 'none', background: 'transparent', textAlign: 'left', padding: 0, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700 }}>{person.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{person.username}</div>
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEditCoach(person)} style={smallButton}>Izmeni</button>
                  <button onClick={() => deleteCoach(person.id)} style={dangerButton}>Obriši</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {parseGroupIds(person.group_ids).map((groupId) => {
                  const group = groups.find((item) => String(item.id) === String(groupId))
                  if (!group) return null
                  return <button key={`${person.id}-${group.id}`} onClick={() => onOpenGroup?.(group, 'statistics')} style={groupChip}>{group.name}</button>
                })}
                {!parseGroupIds(person.group_ids).length ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Nema grupa</div> : null}
              </div>
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

const groupChip = {
  border: '1px solid #334155',
  borderRadius: 999,
  padding: '4px 8px',
  background: '#0f172a',
  color: '#cbd5e1',
  fontSize: 12,
  cursor: 'pointer',
}
