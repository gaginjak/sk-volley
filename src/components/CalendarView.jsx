import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatDate, isAdminRole, parseDateOnly, parseGroupIds, toLocalDateInput } from '../utils'

const weekdayOptions = [
  { value: '1', label: 'Pon' },
  { value: '2', label: 'Uto' },
  { value: '3', label: 'Sre' },
  { value: '4', label: 'Čet' },
  { value: '5', label: 'Pet' },
  { value: '6', label: 'Sub' },
  { value: '0', label: 'Ned' },
]

export function CalendarView({ user, selectedDate, onDateChange, onOpenTraining }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [trainings, setTrainings] = useState([])
  const [activeDate, setActiveDate] = useState(selectedDate || toLocalDateInput(new Date()))
  const [form, setForm] = useState({
    gid: '',
    kind: 'trening',
    date: '',
    date_from: '',
    date_to: '',
    wdays: [],
    time: '',
    note: '',
    hall: '',
    uzrast: '',
    scheduleMode: 'single',
  })
  const [showForm, setShowForm] = useState(false)
  const [groups, setGroups] = useState([])
  const [feedback, setFeedback] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    loadGroups()
    loadTrainings()
  }, [user])

  async function loadGroups() {
    let query = supabase.from('groups').select('*').order('name')
    if (!isAdminRole(user?.role)) {
      const allowedIds = parseGroupIds(user?.group_ids)
      if (allowedIds.length) {
        query = query.in('id', allowedIds)
      } else {
        setGroups([])
        return
      }
    }
    const { data } = await query
    setGroups(data || [])
  }

  async function loadTrainings() {
    let query = supabase.from('trainings').select('*').order('date')
    if (!isAdminRole(user?.role)) {
      const allowedIds = parseGroupIds(user?.group_ids)
      if (allowedIds.length) {
        query = query.in('gid', allowedIds)
      } else {
        setTrainings([])
        return
      }
    }
    const { data } = await query
    setTrainings(data || [])
  }

  const visibleDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const start = new Date(firstDay)
    start.setDate(start.getDate() - ((firstDay.getDay() + 6) % 7))
    const days = []
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      days.push(date)
    }
    return days
  }, [currentDate])

  const monthTrainings = useMemo(() => {
    return trainings.filter((item) => {
      const itemDate = parseDateOnly(item.date)
      return itemDate && itemDate.getMonth() === currentDate.getMonth() && itemDate.getFullYear() === currentDate.getFullYear()
    })
  }, [currentDate, trainings])

  const selectedDayTrainings = useMemo(() => {
    return trainings.filter((item) => item.date === activeDate)
  }, [activeDate, trainings])

  function buildRecurringDates() {
    const start = form.date_from || form.date
    const end = form.date_to || form.date || start
    if (!start) return []
    const dates = []
    const startDate = parseDateOnly(start)
    const endDate = parseDateOnly(end)
    if (!startDate || !endDate) return []
    for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
      const weekday = current.getDay().toString()
      if (form.wdays.includes(weekday)) {
        const value = toLocalDateInput(current)
        dates.push(value)
      }
    }
    return dates
  }

  async function handleCreateTraining(event) {
    event.preventDefault()
    if (!form.gid) {
      setFeedback('Izaberite grupu.')
      return
    }
    const selectedGroup = groups.find((group) => String(group.id) === String(form.gid))
    const noteText = [form.note, form.hall ? `Sala: ${form.hall}` : ''].filter(Boolean).join(' | ')
    const rows = []

    if (form.scheduleMode === 'recurring') {
      const recurringDates = buildRecurringDates()
      if (!recurringDates.length) {
        setFeedback('Odaberite bar jedan dan u periodu.')
        return
      }
      recurringDates.forEach((dateValue) => {
        rows.push({
          gid: Number(form.gid),
          gname: selectedGroup?.name || '',
          uzrast: form.uzrast || selectedGroup?.uzrast || null,
          kind: form.kind || 'trening',
          date: dateValue,
          date_from: form.date_from || null,
          date_to: form.date_to || null,
          wdays: form.wdays.join(','),
          time: form.time || null,
          note: noteText || null,
        })
      })
    } else {
      rows.push({
        gid: Number(form.gid),
        gname: selectedGroup?.name || '',
        uzrast: form.uzrast || selectedGroup?.uzrast || null,
        kind: form.kind || 'trening',
        date: form.date || null,
        date_from: null,
        date_to: null,
        wdays: null,
        time: form.time || null,
        note: noteText || null,
      })
    }

    const { error } = await supabase.from('trainings').insert(rows)
    if (!error) {
      setShowForm(false)
      setForm({ gid: '', kind: 'trening', date: '', date_from: '', date_to: '', wdays: [], time: '', note: '', hall: '', uzrast: '', scheduleMode: 'single' })
      setFeedback('Trening je sačuvan.')
      const nextDate = rows[0]?.date || selectedDate || activeDate
      setActiveDate(nextDate)
      onDateChange?.(nextDate)
      loadTrainings()
    } else {
      setFeedback('Nije uspelo čuvanje treninga.')
    }
  }

  function canManageTraining(training) {
    if (isAdminRole(user?.role)) return true
    const group = groups.find((item) => String(item.id) === String(training?.gid))
    return String(group?.trener_id) === String(user?.id)
  }

  function isRecurringTraining(training) {
    return Boolean(training?.date_from || training?.date_to || training?.wdays)
  }

  async function handleDeleteTraining(training, mode = 'single') {
    if (!training) return
    if (mode === 'series') {
      const { data, error: fetchError } = await supabase
        .from('trainings')
        .select('id')
        .eq('gid', training.gid)
        .eq('kind', training.kind)
        .eq('gname', training.gname || '')
        .eq('uzrast', training.uzrast || null)
        .eq('time', training.time || null)
        .eq('note', training.note || null)
        .eq('date_from', training.date_from || null)
        .eq('date_to', training.date_to || null)
        .eq('wdays', training.wdays || null)
      if (fetchError) {
        setFeedback('Nije uspelo brisanje treninga.')
        return
      }
      const ids = (data || []).map((item) => item.id)
      if (!ids.length) {
        setFeedback('Nije pronađen niz treninga za brisanje.')
        return
      }
      const { error } = await supabase.from('trainings').delete().in('id', ids)
      if (!error) {
        setDeleteTarget(null)
        setFeedback('Serija treninga je obrisana.')
        loadTrainings()
      } else {
        setFeedback('Nije uspelo brisanje treninga.')
      }
      return
    }

    const { error } = await supabase.from('trainings').delete().eq('id', training.id)
    if (!error) {
      setDeleteTarget(null)
      setFeedback('Trening je obrisan.')
      loadTrainings()
    } else {
      setFeedback('Nije uspelo brisanje treninga.')
    }
  }

  function toggleWeekday(value) {
    setForm((current) => ({
      ...current,
      wdays: current.wdays.includes(value) ? current.wdays.filter((item) => item !== value) : [...current.wdays, value],
    }))
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>{currentDate.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Kalendar treniga</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={buttonStyle}>←</button>
          <button onClick={() => setCurrentDate(new Date())} style={buttonStyle}>Danas</button>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={buttonStyle}>→</button>
        </div>
      </div>

      {feedback ? <div style={{ color: '#fde68a', fontSize: 13 }}>{feedback}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
        {['Pon','Uto','Sre','Čet','Pet','Sub','Ned'].map((day) => <div key={day}>{day}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {visibleDays.map((day) => {
          const dayKey = toLocalDateInput(day)
          const hasTraining = monthTrainings.some((item) => item.date === dayKey)
          return (
            <button
              key={dayKey}
              onClick={() => {
                setActiveDate(dayKey)
                if (onDateChange) onDateChange(dayKey)
              }}
              style={{
                border: day.getMonth() === currentDate.getMonth() ? '1px solid #334155' : '1px dashed #475569',
                background: dayKey === selectedDate ? '#1f2937' : day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth() ? '#1f2937' : '#0f172a',
                color: '#f8fafc',
                borderRadius: 12,
                padding: '8px 0',
                minHeight: 56,
                cursor: 'pointer',
              }}
            >
              <div>{day.getDate()}</div>
              {hasTraining ? <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>●</div> : null}
            </button>
          )
        })}
      </div>

      <div style={{ background: '#111827', borderRadius: 16, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: '#f8fafc' }}>Treninzi za {formatDate(activeDate)}</div>
          {isAdminRole(user?.role) || user?.role === 'trener' ? <button onClick={() => setShowForm((value) => !value)} style={buttonStyle}>+ Dodaj</button> : null}
        </div>
        {showForm ? (
          <form onSubmit={handleCreateTraining} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <select value={form.gid} onChange={(event) => setForm({ ...form, gid: event.target.value })} required style={inputStyle}>
              <option value="">Izaberite grupu</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <select value={form.scheduleMode} onChange={(event) => setForm({ ...form, scheduleMode: event.target.value })} style={inputStyle}>
              <option value="single">Jedan trening</option>
              <option value="recurring">Ponavljajući trening</option>
            </select>
            <select value={form.uzrast} onChange={(event) => setForm({ ...form, uzrast: event.target.value })} style={inputStyle}>
              <option value="">Izaberite uzrast</option>
              <option value="Pioniri/Pionirke">Pioniri/Pionirke</option>
              <option value="Kadeti/Kadetkinje">Kadeti/Kadetkinje</option>
              <option value="Juniori/Juniorke">Juniori/Juniorke</option>
              <option value="Seniori/Seniorke">Seniori/Seniorke</option>
            </select>
            <input value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} placeholder="Vrsta" style={inputStyle} />
            {form.scheduleMode === 'recurring' ? (
              <>
                <input type="date" value={form.date_from} onChange={(event) => setForm({ ...form, date_from: event.target.value })} style={inputStyle} />
                <input type="date" value={form.date_to} onChange={(event) => setForm({ ...form, date_to: event.target.value })} style={inputStyle} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {weekdayOptions.map((option) => (
                    <label key={option.value} style={{ color: '#cbd5e1', fontSize: 12 }}>
                      <input type="checkbox" checked={form.wdays.includes(option.value)} onChange={() => toggleWeekday(option.value)} /> {option.label}
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} style={inputStyle} />
            )}
            <input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} style={inputStyle} />
            <input value={form.hall} onChange={(event) => setForm({ ...form, hall: event.target.value })} placeholder="Sala / hala" style={inputStyle} />
            <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Napomena" style={inputStyle} />
            <button type="submit" style={buttonStyle}>Sačuvaj</button>
          </form>
        ) : null}

        {selectedDayTrainings.length === 0 ? <div style={{ color: '#94a3b8' }}>Nema zakazanih treninga.</div> : selectedDayTrainings.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #334155', gap: 8 }}>
            <button
              type="button"
              onClick={() => onOpenTraining?.(item)}
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', padding: 0 }}
            >
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.gname || 'Trening'}</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>{item.kind} • {formatDate(item.date)} • {item.time || '-'} • {item.note || '-'}</div>
              </div>
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              {canManageTraining(item) ? <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteTarget(item) }} style={smallButton}>🗑</button> : null}
            </div>
          </div>
        ))}
      </div>

      {deleteTarget ? (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div style={{ color: '#f8fafc', fontWeight: 700, marginBottom: 8 }}>Are you sure you want to delete this training?</div>
            <div style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 12 }}>{deleteTarget.gname || 'Trening'} • {formatDate(deleteTarget.date)}</div>
            {isRecurringTraining(deleteTarget) ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" onClick={() => handleDeleteTraining(deleteTarget, 'single')} style={modalButton}>Delete only this occurrence</button>
                <button type="button" onClick={() => handleDeleteTraining(deleteTarget, 'series')} style={modalButton}>Delete all occurrences</button>
              </div>
            ) : (
              <button type="button" onClick={() => handleDeleteTraining(deleteTarget, 'single')} style={modalButton}>Delete</button>
            )}
            <button type="button" onClick={() => setDeleteTarget(null)} style={{ ...modalButton, background: '#334155', marginTop: 8 }}>Cancel</button>
          </div>
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
  borderRadius: 999,
  padding: '6px 8px',
  background: '#1f2937',
  color: '#f8fafc',
  cursor: 'pointer',
}

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
}

const modalCard = {
  background: '#111827',
  borderRadius: 16,
  padding: 16,
  width: '100%',
  maxWidth: 360,
  border: '1px solid #334155',
}

const modalButton = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  background: '#ff9800',
  color: '#111827',
  fontWeight: 700,
  cursor: 'pointer',
}
