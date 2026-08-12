import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { parseGroupIds } from '../utils'

export function CoachDetailView({ coach, user, onBack, onOpenGroup }) {
  const [groups, setGroups] = useState([])

  useEffect(() => {
    loadGroups()
  }, [coach?.id])

  async function loadGroups() {
    if (!coach?.id) return
    const [groupsRes, userRes] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('users').select('group_ids').eq('id', coach.id).single(),
    ])

    const assignedByCoachId = (groupsRes.data || []).filter((group) => String(group.trener_id) === String(coach.id))
    const assignedByGroupIds = parseGroupIds(userRes.data?.group_ids)
    const merged = (groupsRes.data || []).filter((group) => assignedByGroupIds.includes(String(group.id)) || assignedByCoachId.some((item) => String(item.id) === String(group.id)))
    setGroups(merged)
  }

  const visibleGroups = useMemo(() => {
    if (user?.role === 'admin' || user?.role === 'Administrator' || user?.role === 'superadmin') {
      return groups
    }
    return []
  }, [groups, user])

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{coach?.name || 'Trener'}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{coach?.username || '-'}</div>
        </div>
        <button onClick={onBack} style={buttonStyle}>← Nazad</button>
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>Grupe koje vodi</div>
        {visibleGroups.length === 0 ? <div style={{ color: '#94a3b8' }}>Nema dodeljenih grupa.</div> : visibleGroups.map((group) => (
          <button
            key={group.id}
            onClick={() => onOpenGroup(group, 'coach-detail')}
            style={{
              width: '100%',
              textAlign: 'left',
              border: '1px solid #334155',
              background: '#0f172a',
              borderRadius: 12,
              padding: 10,
              marginTop: 8,
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700 }}>{group.name}</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{group.uzrast || '-'} • {group.pol || '-'}</div>
          </button>
        ))}
      </div>
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
