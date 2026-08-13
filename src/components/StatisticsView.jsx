import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { getCurrentMonthKey, getMedicalLabel, getMedicalStatus, getMemberIdentityFromPayment, getMemberIdentityFromPlayer, isAdminRole, parseGroupIds, parsePayments } from '../utils'

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
  return getMemberIdentityFromPlayer(player)
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

function toTimestamp(value) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pickCurrentMonthMembershipPayment(payments, currentMonth) {
  const candidates = payments
    .filter((payment) => payment?.paid && isMembershipPayment(payment) && getPaymentMonth(payment) === currentMonth)
    .sort((a, b) => toTimestamp(a?.date) - toTimestamp(b?.date))
  return candidates.length ? candidates[candidates.length - 1] : null
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

function getLastNameKey(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (parts[parts.length - 1] || '').toLowerCase()
}

function isPaymentTypeMatch(payment, selectedType) {
  const type = String(payment?.payment_type || '').trim().toLowerCase()
  const target = String(selectedType || '').trim().toLowerCase()
  if (target === 'članarina' || target === 'clanarina') return type === 'članarina' || type === 'clanarina' || type === 'membership'
  return type === target
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
  const [openUnpaidGroups, setOpenUnpaidGroups] = useState({})
  const [exportByGroup, setExportByGroup] = useState({ groupId: '', paymentType: 'Članarina' })
  const [exportClub, setExportClub] = useState({ paymentType: 'Članarina', rangeType: 'current', endDate: new Date().toISOString().slice(0, 10) })

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
    const currentMonth = getCurrentMonthKey()
    const members = new Map()

    for (const player of visiblePlayers) {
      const key = memberKey(player)
      const existing = members.get(key)
      const playerPayments = parsePayments(player.payments)
      const normalized = playerPayments.map((payment) => ({
        ...payment,
        month_key: payment?.month_key || (payment?.date ? String(payment.date).slice(0, 7) : null),
        member_id: getMemberIdentityFromPayment(payment, player),
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

    const unpaidMemberships = memberEntries.filter((entry) => !pickCurrentMonthMembershipPayment(entry.payments, currentMonth))

    const paidMemberships = memberEntries
      .map((entry) => ({ entry, payment: pickCurrentMonthMembershipPayment(entry.payments, currentMonth) }))
      .filter((item) => Boolean(item.payment))

    const collectedByGroup = new Map()
    let clubTotal = 0
    for (const item of paidMemberships) {
      const { entry, payment } = item
      const amount = toNumber(payment.amount)
      if (!amount) continue
      const key = String(payment.group_id || entry.representative.gid)
      const previous = collectedByGroup.get(key) || 0
      collectedByGroup.set(key, previous + amount)
      clubTotal += amount
    }

    const memberByGroup = new Map()
    const paidByGroup = new Map()

    for (const entry of memberEntries) {
      for (const gid of entry.groups) {
        if (!memberByGroup.has(gid)) memberByGroup.set(gid, new Set())
        memberByGroup.get(gid).add(memberKey(entry.representative))
      }
    }

    for (const item of paidMemberships) {
      const { entry, payment } = item
      const gid = String(payment.group_id || entry.representative.gid)
      if (!paidByGroup.has(gid)) paidByGroup.set(gid, new Set())
      paidByGroup.get(gid).add(memberKey(entry.representative))
    }

    const collectedPerGroup = visibleGroups.map((group) => {
      const gid = String(group.id)
      const totalMembers = memberByGroup.get(gid)?.size || 0
      const paidMembers = paidByGroup.get(gid)?.size || 0
      const unpaidMembers = Math.max(totalMembers - paidMembers, 0)
      return {
        id: group.id,
        name: group.name,
        total: Math.round((collectedByGroup.get(gid) || 0) * 100) / 100,
        paidMembers,
        unpaidMembers,
      }
    })

    const visibleCoachIds = new Set(visibleGroups.map((group) => String(group.trener_id || '')))
    const coachUsers = isAdminRole(user?.role)
      ? users.filter((person) => (person.role === 'trener' || person.role === 'coach' || person.role === 'Coach') && visibleCoachIds.has(String(person.id)))
      : users.filter((person) => String(person.id) === String(user?.id))

    const coachStats = coachUsers.map((coach) => {
      const coachGroups = visibleGroups.filter((group) => String(group.trener_id) === String(coach.id))
      const coachGroupIds = new Set(coachGroups.map((group) => String(group.id)))
      let coachTotal = 0
      let paidCount = 0
      let unpaidCount = 0

      for (const item of collectedPerGroup) {
        if (coachGroupIds.has(String(item.id))) {
          coachTotal += item.total
          paidCount += item.paidMembers
          unpaidCount += item.unpaidMembers
        }
      }

      return {
        coach,
        groups: coachGroups,
        total: Math.round(coachTotal * 100) / 100,
        paidCount,
        unpaidCount,
      }
    })

    const medicalWarnings = visiblePlayers.map((player) => ({ ...player, status: getMedicalStatus(player.medical_expiry_date || player.medical) })).filter((player) => player.status !== 'ok')

    const unpaidByGroup = new Map()
    for (const entry of unpaidMemberships) {
      const sortedGroupIds = Array.from(entry.groups).sort((a, b) => {
        const aName = groups.find((item) => String(item.id) === String(a))?.name || ''
        const bName = groups.find((item) => String(item.id) === String(b))?.name || ''
        return aName.localeCompare(bName, 'sr-Latn-RS')
      })
      for (const gid of sortedGroupIds) {
        if (!unpaidByGroup.has(gid)) unpaidByGroup.set(gid, [])
        unpaidByGroup.get(gid).push(entry.representative)
      }
    }

    const unpaidGroups = Array.from(unpaidByGroup.entries())
      .map(([gid, members]) => {
        const group = groups.find((item) => String(item.id) === String(gid))
        const uniqueMembers = members.filter((member, index, array) => array.findIndex((item) => memberKey(item) === memberKey(member)) === index)
        uniqueMembers.sort((a, b) => {
          const lastNameCompare = getLastNameKey(a.name).localeCompare(getLastNameKey(b.name), 'sr-Latn-RS')
          if (lastNameCompare !== 0) return lastNameCompare
          return String(a.name || '').localeCompare(String(b.name || ''), 'sr-Latn-RS')
        })
        return {
          gid,
          name: group?.name || 'Nepoznata grupa',
          members: uniqueMembers,
        }
      })
      .filter((item) => item.members.length)
      .sort((a, b) => a.name.localeCompare(b.name, 'sr-Latn-RS'))

    return {
      medicalWarnings,
      currentMonth,
      unpaidMemberships,
      unpaidGroups,
      paidMembershipsCount: paidMemberships.length,
      collectedPerGroup,
      coachStats,
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
  }, [attendance, groups, visibleGroups, visiblePlayers])

  function toggleUnpaidGroup(groupId) {
    setOpenUnpaidGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
  }

  function exportPaymentsByGroup() {
    const group = groups.find((item) => String(item.id) === String(exportByGroup.groupId))
    if (!group) return
    const rows = visiblePlayers
      .filter((player) => String(player.gid) === String(group.id))
      .flatMap((player) => parsePayments(player.payments).filter((payment) => isPaymentTypeMatch(payment, exportByGroup.paymentType)).map((payment) => ({
        'Igrac': player.name,
        'Mesec': payment.month_key || payment.month || '',
        'Iznos': payment.amount || '',
        'Valuta': payment.currency || 'RSD',
        'Datum': payment.date || '',
        'Status': payment.paid ? 'Plaćeno' : 'Neplaćeno',
      })))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments')
    const safeGroupName = String(group.name || 'group').replace(/[^a-zA-Z0-9_-]/g, '_')
    XLSX.writeFile(workbook, `${safeGroupName}_${exportByGroup.paymentType}_payments.xlsx`)
  }

  function exportPaymentsClub() {
    const selectedType = exportClub.paymentType
    const currentMonth = getCurrentMonthKey()
    const endDate = exportClub.endDate || new Date().toISOString().slice(0, 10)
    const endMonth = endDate.slice(0, 7)

    const rows = visiblePlayers.flatMap((player) => {
      const group = groups.find((item) => String(item.id) === String(player.gid))
      return parsePayments(player.payments)
        .filter((payment) => isPaymentTypeMatch(payment, selectedType))
        .filter((payment) => {
          const month = getPaymentMonth(payment)
          if (!month) return false
          if (exportClub.rangeType === 'current') return month === currentMonth
          return month <= endMonth
        })
        .map((payment) => ({
          'Grupa': group?.name || 'Nepoznata grupa',
          'Igrac': player.name,
          'Mesec': payment.month_key || payment.month || '',
          'Iznos': toNumber(payment.amount),
          'Valuta': payment.currency || 'RSD',
          'Datum': payment.date || '',
          'Status': payment.paid ? 'Plaćeno' : 'Neplaćeno',
        }))
    })

    const totalCollected = rows.filter((row) => row['Status'] === 'Plaćeno').reduce((sum, row) => sum + toNumber(row['Iznos']), 0)
    const summaryRow = {
      'Grupa': 'UKUPNO',
      'Igrac': '',
      'Mesec': '',
      'Iznos': Math.round(totalCollected * 100) / 100,
      'Valuta': 'RSD',
      'Datum': '',
      'Status': 'Plaćeno',
    }

    const worksheet = XLSX.utils.json_to_sheet([...rows, summaryRow])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ClubPayments')
    XLSX.writeFile(workbook, `club_${selectedType}_payments_${exportClub.rangeType}.xlsx`)
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>Statistika</div>
      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>1. Ukupno naplaćene članarine</div>
        <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Mesec: {stats.currentMonth}</div>
        <div style={{ marginTop: 6, color: '#cbd5e1' }}>Plaćeni članovi: <span style={{ color: '#f8fafc', fontWeight: 700 }}>{stats.paidMembershipsCount}</span></div>
        <div style={{ marginTop: 6, color: '#ff9800', fontSize: 20, fontWeight: 800 }}>{stats.clubTotal.toLocaleString('sr-RS')} RSD</div>
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>2. Pregled po grupama</div>
        {stats.collectedPerGroup.map((item) => {
          const group = groups.find((candidate) => String(candidate.id) === String(item.id))
          return (
            <button key={item.id} onClick={() => onOpenGroup?.(group || { id: item.id, name: item.name }, 'statistics')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, border: '1px solid #334155', borderRadius: 10, background: '#0f172a', color: '#f8fafc', padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>Plaćeno: {item.paidMembers} • Neplaćeno: {item.unpaidMembers}</div>
              </div>
              <div style={{ color: '#ff9800', fontWeight: 700 }}>{item.total.toLocaleString('sr-RS')} RSD</div>
            </button>
          )
        })}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>3. Treneri</div>
        {stats.coachStats.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Nema podataka za trenere.</div> : stats.coachStats.map((item) => (
          <div key={item.coach.id} style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 10, padding: 10, background: '#0f172a' }}>
            <button onClick={() => onOpenCoach?.(item.coach)} style={{ border: 'none', background: 'transparent', color: '#f8fafc', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>{item.coach.name}</button>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{item.coach.username}</div>
            <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>Grupe: {item.groups.length}</div>
            <div style={{ color: '#cbd5e1', fontSize: 12 }}>Plaćeno: {item.paidCount} • Neplaćeno: {item.unpaidCount}</div>
            <div style={{ color: '#ff9800', fontWeight: 700, marginTop: 4 }}>{item.total.toLocaleString('sr-RS')} RSD</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>4. Neplaćene članarine za tekući mesec</div>
        {stats.unpaidGroups.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Svi članovi su izmirili članarinu za ovaj mesec.</div> : stats.unpaidGroups.map((groupItem) => (
          <div key={groupItem.gid} style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
            <button type="button" onClick={() => toggleUnpaidGroup(groupItem.gid)} style={{ width: '100%', border: 'none', background: '#0f172a', color: '#f8fafc', fontWeight: 700, textAlign: 'left', padding: '10px 12px', cursor: 'pointer' }}>
              {openUnpaidGroups[groupItem.gid] ? '▼' : '▶'} {groupItem.name} ({groupItem.members.length})
            </button>
            {openUnpaidGroups[groupItem.gid] ? (
              <div style={{ display: 'grid', gap: 6, padding: '8px 12px', background: '#111827' }}>
                {groupItem.members.map((member) => (
                  <button key={memberKey(member)} type="button" onClick={() => onOpenPlayer?.(member, 'statistics')} style={{ border: 'none', background: 'transparent', color: '#fca5a5', fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: 0 }}>{member.name}</button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc' }}>Medicinska upozorenja</div>
        {stats.medicalWarnings.length === 0 ? <div style={{ color: '#94a3b8', marginTop: 8 }}>Nema upozorenja.</div> : stats.medicalWarnings.map((player) => (
          <button key={player.id} onClick={() => onOpenPlayer?.(player, 'statistics')} style={{ border: 'none', background: 'transparent', color: player.status === 'expired' ? '#fca5a5' : '#fde68a', marginTop: 8, fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: 0 }}>{player.name} • {getMedicalLabel(player.status)}</button>
        ))}
      </div>

      {isAdminRole(user?.role) ? (
        <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
          <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 10 }}>Export uplata (Admin)</div>
          <div style={{ display: 'grid', gap: 8, border: '1px solid #334155', borderRadius: 10, padding: 10, background: '#0f172a', marginBottom: 10 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>Option A — Export by group</div>
            <select value={exportByGroup.groupId} onChange={(event) => setExportByGroup({ ...exportByGroup, groupId: event.target.value })} style={inputStyle}>
              <option value="">Izaberite grupu</option>
              {visibleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <select value={exportByGroup.paymentType} onChange={(event) => setExportByGroup({ ...exportByGroup, paymentType: event.target.value })} style={inputStyle}>
              <option value="Članarina">Članarina</option>
              <option value="Kamp">Kamp</option>
              <option value="Oprema">Oprema</option>
            </select>
            <button type="button" onClick={exportPaymentsByGroup} style={buttonStyle}>Export grupa</button>
          </div>

          <div style={{ display: 'grid', gap: 8, border: '1px solid #334155', borderRadius: 10, padding: 10, background: '#0f172a', marginBottom: 12 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 13 }}>Option B — Export for entire club</div>
            <select value={exportClub.paymentType} onChange={(event) => setExportClub({ ...exportClub, paymentType: event.target.value })} style={inputStyle}>
              <option value="Članarina">Članarina</option>
              <option value="Kamp">Kamp</option>
              <option value="Oprema">Oprema</option>
            </select>
            <select value={exportClub.rangeType} onChange={(event) => setExportClub({ ...exportClub, rangeType: event.target.value })} style={inputStyle}>
              <option value="current">Current month only</option>
              <option value="fromStart">From start to end date</option>
            </select>
            {exportClub.rangeType === 'fromStart' ? <input type="date" value={exportClub.endDate} onChange={(event) => setExportClub({ ...exportClub, endDate: event.target.value })} style={inputStyle} /> : null}
            <button type="button" onClick={exportPaymentsClub} style={buttonStyle}>Export klub</button>
          </div>

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
