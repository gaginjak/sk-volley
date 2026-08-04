import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getMedicalLabel, getMedicalStatus, isAdminRole, parseGroupIds } from '../utils'

export function MedicalAlerts({ user }) {
  const [groups, setGroups] = useState([])
  const [players, setPlayers] = useState([])

  useEffect(() => {
    loadData()

    const channel = supabase.channel('medical-alerts-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, user?.role, user?.group_ids])

  async function loadData() {
    let groupsQuery = supabase.from('groups').select('*').order('name')
    if (!isAdminRole(user?.role)) {
      const allowedIds = parseGroupIds(user?.group_ids)
      if (allowedIds.length) {
        groupsQuery = groupsQuery.in('id', allowedIds)
      } else {
        setGroups([])
        setPlayers([])
        return
      }
    }

    const [groupsRes, playersRes] = await Promise.all([
      groupsQuery,
      supabase.from('players').select('*').order('name'),
    ])

    const visibleGroupIds = (groupsRes.data || []).map((group) => String(group.id))
    const visiblePlayers = (playersRes.data || []).filter((player) => visibleGroupIds.includes(String(player.gid)))

    setGroups(groupsRes.data || [])
    setPlayers(visiblePlayers)
  }

  const alerts = useMemo(() => {
    return players
      .map((player) => {
        const status = getMedicalStatus(player.medical_expiry_date || player.medical)
        const group = groups.find((item) => String(item.id) === String(player.gid))
        return {
          ...player,
          status,
          groupName: group?.name || 'Nepoznata grupa',
        }
      })
      .filter((player) => player.status !== 'ok')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [groups, players])

  if (!alerts.length) return null

  return (
    <div style={{ margin: 16, background: '#111827', borderRadius: 16, padding: 14, border: '1px solid #334155' }}>
      <div style={{ color: '#ff9800', fontWeight: 800, marginBottom: 8 }}>Obaveštenja o medicinskim</div>
      {alerts.map((player) => (
        <div key={player.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155' }}>
          <div style={{ color: player.status === 'expired' ? '#fca5a5' : '#fde68a', fontWeight: 700 }}>{player.name}</div>
          <div style={{ color: '#cbd5e1', fontSize: 13 }}>{player.groupName}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Ističe: {player.medical_expiry_date || player.medical || '-'}</div>
        </div>
      ))}
    </div>
  )
}
