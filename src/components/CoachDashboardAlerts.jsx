import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getMedicalStatus, isAdminRole } from '../utils'
import { getAttendanceWarnings } from './coachAlertUtils'

export function CoachDashboardAlerts({ user, dismissedAlerts, onOpenAlert }) {
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([])
  const [attendance, setAttendance] = useState([])

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
    const channels = ['groups', 'players', 'attendance'].map((table) => supabase.channel(`coach-dashboard-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, loadData)
      .subscribe())
    return () => channels.forEach((channel) => supabase.removeChannel(channel))
  }, [user?.id, user?.role])

  const alerts = useMemo(() => {
    const attendanceWarnings = getAttendanceWarnings(players, groups, attendance)
    const medicalWarnings = players.filter((player) => getMedicalStatus(player.medical_expiry_date || player.medical) !== 'ok')
    return {
      attendance: attendanceWarnings,
      medical: medicalWarnings,
    }
  }, [attendance, groups, players])

  const cards = [
    { type: 'attendance', title: 'Attendance Alert - Players with 3 consecutive absences', count: alerts.attendance.length },
    { type: 'medical', title: 'Medical Examination Alert - Medicals expiring soon or expired', count: alerts.medical.length },
  ]

  return (
    <section style={{ margin: 16, display: 'grid', gap: 10 }}>
      <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 18 }}>Obaveštenja</div>
      {cards.map((card) => {
        const hasIssues = card.count > 0
        if (hasIssues && dismissedAlerts.includes(card.type)) return null
        return (
          <button key={card.type} type="button" onClick={() => onOpenAlert?.(card.type)} style={{ display: 'grid', gap: 5, textAlign: 'left', border: hasIssues ? '1px solid #ef4444' : '1px solid #334155', borderRadius: 12, padding: 14, background: '#111827', color: '#f8fafc', cursor: 'pointer' }}>
            <span style={{ fontWeight: 800 }}>{card.title}</span>
            <span style={{ color: hasIssues ? '#fecaca' : '#94a3b8', fontSize: 13 }}>{hasIssues ? `${card.count} ${card.type === 'attendance' ? 'igrača zahteva proveru.' : 'igrača zahteva pažnju.'}` : 'Nema problema.'}</span>
          </button>
        )
      })}
    </section>
  )
}