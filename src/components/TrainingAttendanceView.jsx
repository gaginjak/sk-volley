import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate } from '../utils'

export function TrainingAttendanceView({ training, group, onBack }) {
  const [players, setPlayers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    loadData()
  }, [training?.gid, training?.date])

  async function loadData() {
    if (!training?.gid || !training?.date) return
    const [playersRes, attendanceRes] = await Promise.all([
      supabase.from('players').select('*').eq('gid', training.gid).order('name'),
      supabase.from('attendance').select('*').eq('group_id', training.gid).eq('training_date', training.date),
    ])
    setPlayers(playersRes.data || [])
    setAttendance(attendanceRes.data || [])
  }

  async function setAttendanceStatus(playerId, status) {
    const existing = attendance.find((item) => String(item.player_id) === String(playerId))
    const result = existing
      ? await supabase.from('attendance').update({ status }).eq('id', existing.id)
      : await supabase.from('attendance').insert([{ player_id: playerId, group_id: training.gid, training_date: training.date, status }])

    if (result.error) {
      setFeedback('Nije uspelo čuvanje prisustva.')
      return
    }
    setFeedback('Prisustvo je sačuvano.')
    await loadData()
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{group?.name || training?.gname || 'Trening'}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{formatDate(training?.date)} {training?.time ? `• ${training.time}` : ''}</div>
        </div>
        <button type="button" onClick={onBack} style={buttonStyle}>← Nazad</button>
      </div>

      <div style={{ color: '#f8fafc', fontWeight: 700 }}>Prisustvo</div>
      {feedback ? <div style={{ color: '#fde68a', fontSize: 13 }}>{feedback}</div> : null}
      {players.length === 0 ? <div style={{ color: '#94a3b8' }}>Nema igrača u ovoj grupi.</div> : players.map((player) => {
        const record = attendance.find((item) => String(item.player_id) === String(player.id))
        return (
          <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111827', borderRadius: 12, padding: 10 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700 }}>{player.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setAttendanceStatus(player.id, 'present')} style={markButton(record?.status === 'present' ? '#22c55e' : '#1f2937')}>✓</button>
              <button type="button" onClick={() => setAttendanceStatus(player.id, 'absent')} style={markButton(record?.status === 'absent' ? '#ef4444' : '#1f2937')}>✕</button>
            </div>
          </div>
        )
      })}
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

const markButton = (background) => ({
  border: 'none',
  width: 36,
  height: 36,
  borderRadius: 999,
  background,
  color: '#fff',
  cursor: 'pointer',
})