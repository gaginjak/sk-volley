import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchGroupAttendance, formatAttendanceDate, getGroupAttendanceView } from '../attendanceUtils'
import { getCurrentMonthKey, getMemberIdentityFromPlayer } from '../utils'

async function fetchAllRows(makeQuery) {
  const rows = []
  const pageSize = 1000
  for (let offset = 0; ; ) {
    const { data, error, count } = await makeQuery().range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    offset += page.length
    if (count != null ? offset >= count : page.length < pageSize) return rows
    if (!page.length) throw new Error('Could not fetch all rows')
  }
}

function statusLabel(status, gender) {
  const normalized = String(gender || '').toLocaleLowerCase('sr-Latn-RS')
  const female = normalized === 'ženski'
  const male = normalized === 'muški'
  if (status === 'p') return { text: female ? 'Prisutna' : male ? 'Prisutan' : 'Prisutna/Prisutan', color: '#86efac' }
  if (status === 'absent' || status === 'a') return { text: female ? 'Odsutna' : male ? 'Odsutan' : 'Odsutna/Odsutan', color: '#fca5a5' }
  return { text: '—', color: '#94a3b8' }
}

export function PlayerAttendance({ playerId }) {
  const [state, setState] = useState({ loading: true, groups: [], error: '' })

  useEffect(() => {
    let active = true
    async function loadAttendance() {
      setState({ loading: true, groups: [], error: '' })
      try {
        const monthKey = getCurrentMonthKey()
        const [year, month] = monthKey.split('-').map(Number)
        const nextMonth = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`
        const playerRows = await fetchAllRows(() => supabase.from('players').select('*', { count: 'exact' }).order('id'))
        const player = playerRows.find((row) => String(row.id) === String(playerId))
        if (!player) throw new Error('Player not found')
        const identity = getMemberIdentityFromPlayer(player)
        const memberships = playerRows.filter((row) => getMemberIdentityFromPlayer(row) === identity && row.gid != null)
        const groupIds = [...new Set(memberships.map((row) => String(row.gid)))]
        if (!groupIds.length) {
          if (active) setState({ loading: false, groups: [], error: '' })
          return
        }
        const { data: groupRows, error: groupError } = await supabase.from('groups').select('*').in('id', groupIds)
        if (groupError) throw groupError
        const groups = await Promise.all(groupIds.map(async (groupId) => {
          const [attendanceResult, trainings] = await Promise.all([
            fetchGroupAttendance(supabase, groupId),
            fetchAllRows(() => supabase.from('trainings').select('*', { count: 'exact' })
              .eq('gid', groupId).gte('date', `${monthKey}-01`).lt('date', `${nextMonth}-01`).order('id')),
          ])
          if (attendanceResult.error) throw attendanceResult.error
          const records = attendanceResult.data
          const playerIds = memberships.filter((row) => String(row.gid) === groupId).map((row) => row.id)
          console.log('Attendance data for player and group:', {
            groupId, playerIds, records: records.filter((row) => playerIds.some((id) => String(id) === String(row.player_id))), groupRecords: records,
          })
          return {
            id: groupId,
            group: (groupRows || []).find((row) => String(row.id) === groupId),
            ...getGroupAttendanceView(records, trainings, groupId, playerIds, monthKey),
          }
        }))
        groups.sort((a, b) => String(a.group?.name || '').localeCompare(String(b.group?.name || ''), 'sr-Latn-RS'))
        if (active) setState({ loading: false, groups, error: '' })
      } catch (error) {
        console.error('Attendance loading failed:', error)
        if (active) setState({ loading: false, groups: [], error: 'Nije uspelo učitavanje prisustva.' })
      }
    }
    void loadAttendance()
    return () => { active = false }
  }, [playerId])

  if (state.loading) return <div style={{ color: '#94a3b8' }}>Učitavanje prisustva...</div>
  if (state.error) return <div role="alert" style={{ color: '#fca5a5' }}>{state.error}</div>
  if (!state.groups.length) return <div style={{ color: '#94a3b8' }}>Igrač nije u grupi.</div>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>Treninzi u tekućem mesecu</div>
      {state.groups.map(({ id, group, dates, month }) => (
        <section key={id} style={cardStyle}>
          <div style={groupHeading}>{group?.name || 'Nepoznata grupa'}</div>
          {dates.length ? dates.map((date) => {
            const formatted = formatAttendanceDate(date)
            const status = statusLabel(month.byDate.get(date), group?.pol)
            return (
              <div key={date} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid #283548', fontSize: 14 }}>
                <span style={{ color: '#e2e8f0' }}>{formatted.date} <span style={{ color: '#94a3b8' }}>• {formatted.weekday}</span></span>
                <span style={{ color: status.color, fontWeight: 700 }}>{status.text}</span>
              </div>
            )
          }) : <div style={{ color: '#94a3b8', fontSize: 13 }}>Nema treninga u tekućem mesecu.</div>}
        </section>
      ))}
      <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>Statistika</div>
      {state.groups.map(({ id, group, month, season }) => (
        <section key={id} style={cardStyle}>
          <div style={groupHeading}>{group?.name || 'Nepoznata grupa'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {[['Tekući mesec', month], ['Cela sezona', season]].map(([label, stats]) => (
              <div key={label} style={{ background: '#1e293b', borderRadius: 10, padding: 12 }}>
                <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{label}</div>
                <div style={{ color: '#f8fafc', fontSize: 17, fontWeight: 800, marginTop: 4 }}>{stats.presentCount} / {stats.dates.length} <span style={{ color: '#ff9800' }}>• {stats.percentage}%</span></div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const cardStyle = { background: '#111827', borderRadius: 16, padding: 14 }
const groupHeading = { color: '#f8fafc', fontWeight: 700, marginBottom: 10 }