import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate } from '../utils'
import { createAttendanceSaveQueue } from './attendanceSaveQueue'

export function TrainingAttendanceView({ training, group, onBack }) {
  const [players, setPlayers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [feedback, setFeedback] = useState(null)
  const queueRef = useRef(null)

  useEffect(() => {
    let active = true
    const groupId = training?.gid
    const trainingDate = training?.date
    queueRef.current = null
    setPlayers([])
    setAttendance([])
    setFeedback(null)

    async function loadData() {
      if (!groupId || !trainingDate) return
      try {
        const [playersRes, attendanceRes] = await Promise.all([
          supabase.from('players').select('*').eq('gid', groupId).order('name'),
          supabase.from('attendance').select('*').eq('group_id', groupId).eq('training_date', trainingDate),
        ])
        if (!active) return
        if (playersRes.error || attendanceRes.error) throw playersRes.error || attendanceRes.error
        const records = attendanceRes.data || []
        queueRef.current = createAttendanceSaveQueue({
          records,
          groupId,
          trainingDate,
          async save(playerId, status, existing) {
            const query = existing
              ? supabase.from('attendance').update({ status }).eq('id', existing.id)
              : supabase.from('attendance').insert([{ player_id: playerId, group_id: groupId, training_date: trainingDate, status }])
            const { data, error } = await query.select().single()
            if (error) throw error
            return data
          },
          onChange(playerId, record) {
            if (!active) return
            setAttendance((current) => {
              const remaining = current.filter((item) => String(item.player_id) !== String(playerId))
              return record ? [...remaining, record] : remaining
            })
          },
          onError(error) {
            if (!active) return
            console.error('Attendance save failed:', error)
            setFeedback({ message: 'Nije uspelo čuvanje prisustva.' })
          },
        })
        setAttendance(records)
        setPlayers(playersRes.data || [])
      } catch (error) {
        if (!active) return
        console.error('Attendance loading failed:', error)
        setFeedback({ message: 'Nije uspelo učitavanje prisustva.' })
      }
    }

    void loadData()
    return () => { active = false; queueRef.current = null }
  }, [training?.gid, training?.date])

  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [feedback])

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
      {feedback ? <div role="alert" style={{ color: '#fde68a', fontSize: 13 }}>{feedback.message}</div> : null}
      {players.length === 0 ? <div style={{ color: '#94a3b8' }}>Nema igrača u ovoj grupi.</div> : players.map((player) => {
        const record = attendance.find((item) => String(item.player_id) === String(player.id))
        return (
          <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111827', borderRadius: 12, padding: 10 }}>
            <div style={{ color: '#f8fafc', fontWeight: 700 }}>{player.name}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" aria-label={`Prisutan: ${player.name}`} aria-pressed={record?.status === 'p'} onClick={() => queueRef.current?.mark(player.id, 'p')} style={markButton(record?.status === 'p' ? '#22c55e' : '#1f2937')}>✓</button>
              <button type="button" aria-label={`Odsutan: ${player.name}`} aria-pressed={['absent', 'a'].includes(record?.status)} onClick={() => queueRef.current?.mark(player.id, 'absent')} style={markButton(['absent', 'a'].includes(record?.status) ? '#ef4444' : '#1f2937')}>✕</button>
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