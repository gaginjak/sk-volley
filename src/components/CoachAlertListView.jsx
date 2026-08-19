import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate, getMedicalLabel, getMedicalStatus, isAdminRole } from '../utils'
import { getAttendanceWarnings } from './coachAlertUtils'

export function CoachAlertListView({ user, alertType, onBack, onMarkRead }) {
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [markedRead, setMarkedRead] = useState(false)

  const loadData = useEffectEvent(async () => {
    const [groupsRes, playersRes, attendanceRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('players').select('*').order('name'),
      supabase.from('attendance').select('*'),
    ])
    const allGroups = groupsRes.data || []
    const visibleGroups = isAdminRole(user?.role) ? allGroups : allGroups.filter((group) => String(group.trener_id) === String(user?.id))
    const visibleGroupIds = new Set(visibleGroups.map((group) => String(group.id)))
    setGroups(visibleGroups)
    setPlayers((playersRes.data || []).filter((player) => visibleGroupIds.has(String(player.gid))))
    setAttendance((attendanceRes.data || []).filter((item) => visibleGroupIds.has(String(item.group_id))))
  })

  useEffect(() => {
    loadData()
  }, [user?.id, user?.role])

  const warnings = useMemo(() => {
    if (alertType === 'attendance') return getAttendanceWarnings(players, groups, attendance)
    return players.map((player) => ({ player, group: groups.find((item) => String(item.id) === String(player.gid)), status: getMedicalStatus(player.medical_expiry_date || player.medical) }))
      .filter((item) => item.status !== 'ok')
  }, [alertType, attendance, groups, players])
  function markAsRead() {
    onMarkRead?.(alertType)
    setMarkedRead(true)
    onBack()
  }

  const title = alertType === 'attendance'
    ? 'Attendance Alert - Players with 3 consecutive absences'
    : 'Medical Examination Alert - Medicals expiring soon or expired'

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <button type="button" onClick={onBack} style={backButton}>← Nazad</button>
      <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{title}</div>
      {warnings.length === 0 ? <div style={{ color: '#94a3b8' }}>Nema problema.</div> : warnings.map((item) => (
        <div key={item.player.id} style={{ background: '#111827', border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
          <div style={{ color: '#f8fafc', fontWeight: 800 }}>{item.player.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{item.group?.name || 'Nepoznata grupa'}</div>
          {alertType === 'attendance' ? <div style={{ color: '#fecaca', fontSize: 13, marginTop: 6 }}>Propušteni treninzi: {item.missedDates.map(formatDate).join(', ')}</div> : <div style={{ color: item.status === 'expired' ? '#fca5a5' : '#fde68a', fontSize: 13, marginTop: 6 }}>Ističe: {formatDate(item.player.medical_expiry_date || item.player.medical)} - {getMedicalLabel(item.status)}</div>}
        </div>
      ))}
      {warnings.length ? <button type="button" onClick={markAsRead} style={markReadButton}>{markedRead ? 'Označeno kao pročitano' : 'Označi kao pročitano'}</button> : null}
    </div>
  )
}

const backButton = {
  justifySelf: 'start',
  border: '1px solid #334155',
  borderRadius: 10,
  background: '#0f172a',
  color: '#f8fafc',
  padding: '8px 12px',
  cursor: 'pointer',
  fontWeight: 700,
}

const markReadButton = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  background: '#ff9800',
  color: '#111827',
  cursor: 'pointer',
  fontWeight: 800,
}