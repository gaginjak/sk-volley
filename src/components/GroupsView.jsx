import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { isAdminRole, parseGroupIds } from '../utils'

export function GroupsView({ user, onOpenGroup }) {
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ name: '', uzrast: '', pol: '', trener_id: '' })
  const [showForm, setShowForm] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    loadGroups()
    loadUsers()
  }, [user])

  async function loadGroups() {
    const { data } = await supabase.from('groups').select('*').order('name')
    const allGroups = data || []
    if (isAdminRole(user?.role)) {
      setGroups(allGroups)
      return
    }

    const allowedIds = parseGroupIds(user?.group_ids)
    const visible = allGroups.filter((group) => allowedIds.includes(String(group.id)) || String(group.trener_id) === String(user?.id))
    setGroups(visible)
  }

  async function loadUsers() {
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data || [])
  }

  function resetForm() {
    setShowForm(false)
    setEditingGroupId(null)
    setForm({ name: '', uzrast: '', pol: '', trener_id: '' })
  }

  function startCreateGroup() {
    resetForm()
    setShowForm(true)
  }

  function startEditGroup(group) {
    setEditingGroupId(group.id)
    setForm({
      name: group.name || '',
      uzrast: group.uzrast || '',
      pol: group.pol || '',
      trener_id: group.trener_id || '',
    })
    setShowForm(true)
  }

  async function handleSaveGroup(event) {
    event.preventDefault()
    if (!form.name.trim()) {
      setFeedback('Unesite naziv grupe.')
      return
    }
    const payload = {
      name: form.name.trim(),
      uzrast: form.uzrast || null,
      pol: form.pol || null,
      trener_id: form.trener_id || null,
    }

    let result
    if (editingGroupId) {
      result = await supabase.from('groups').update(payload).eq('id', editingGroupId)
    } else {
      result = await supabase.from('groups').insert([payload])
    }

    if (!result.error) {
      resetForm()
      setFeedback(editingGroupId ? 'Grupa je uspešno izmenjena.' : 'Grupa je uspešno sačuvana.')
      await loadGroups()
    } else {
      setFeedback('Nije uspelo čuvanje grupe.')
    }
  }

  const visibleGroups = useMemo(() => {
    const allowedIds = parseGroupIds(user?.group_ids)
    return groups.filter((group) => isAdminRole(user?.role) || allowedIds.includes(String(group.id)) || String(group.trener_id) === String(user?.id))
  }, [groups, user])

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#ff9800', fontSize: 22, fontWeight: 800 }}>Grupe</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Pregled dostupnih grupa</div>
        </div>
        {isAdminRole(user?.role) ? <button onClick={startCreateGroup} style={buttonStyle}>+ Nova grupa</button> : null}
      </div>

      {feedback ? <div style={{ color: '#fde68a', fontSize: 13 }}>{feedback}</div> : null}

      {showForm ? (
        <form onSubmit={handleSaveGroup} style={{ display: 'grid', gap: 8, background: '#111827', borderRadius: 16, padding: 12 }}>
          <div style={{ color: '#f8fafc', fontWeight: 700 }}>{editingGroupId ? 'Izmena grupe' : 'Nova grupa'}</div>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Naziv grupe" required style={inputStyle} />
          <select value={form.uzrast} onChange={(event) => setForm({ ...form, uzrast: event.target.value })} style={inputStyle}>
            <option value="">Izaberite uzrast</option>
            <option value="Pioniri/Pionirke">Pioniri/Pionirke</option>
            <option value="Kadeti/Kadetkinje">Kadeti/Kadetkinje</option>
            <option value="Juniori/Juniorke">Juniori/Juniorke</option>
            <option value="Seniori/Seniorke">Seniori/Seniorke</option>
          </select>
          <select value={form.pol} onChange={(event) => setForm({ ...form, pol: event.target.value })} style={inputStyle}>
            <option value="">Izaberite pol</option>
            <option value="Muški">Muški</option>
            <option value="Ženski">Ženski</option>
            <option value="Mešovito">Mešovito</option>
          </select>
          <select value={form.trener_id} onChange={(event) => setForm({ ...form, trener_id: event.target.value })} style={inputStyle}>
            <option value="">Izaberite trenera</option>
            {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={buttonStyle}>Sačuvaj</button>
            <button type="button" onClick={resetForm} style={secondaryButton}>Otkaži</button>
          </div>
        </form>
      ) : null}

      {visibleGroups.map((group) => (
        <div key={group.id} style={{ border: '1px solid #334155', background: '#111827', borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button onClick={() => onOpenGroup(group)} style={{ border: 'none', background: 'transparent', color: '#f8fafc', textAlign: 'left', cursor: 'pointer', flex: 1, padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>{group.name}</div>
              <div style={{ color: '#ff9800', fontSize: 12 }}>{group.pol || '-'}</div>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{group.uzrast || '-'} • Trener: {users.find((u) => u.id === group.trener_id)?.name || 'N/A'}</div>
          </button>
          {isAdminRole(user?.role) ? <button onClick={() => startEditGroup(group)} style={smallButton}>Izmeni</button> : null}
        </div>
      ))}
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

const secondaryButton = {
  border: '1px solid #475569',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#0f172a',
  color: '#f8fafc',
  cursor: 'pointer',
}

const smallButton = {
  border: 'none',
  borderRadius: 8,
  padding: '6px 10px',
  background: '#1f2937',
  color: '#f8fafc',
  cursor: 'pointer',
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#f8fafc',
}
