import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { parseGroupIds } from '../utils'

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    const { data, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .eq('password', password)
      .single()

    if (dbError || !data) {
      setError('Neispravno korisničko ime ili lozinka.')
      setBusy(false)
      return
    }

    onLogin({
      id: data.id,
      name: data.name,
      role: data.role,
      username: data.username,
      group_ids: parseGroupIds(data.group_ids),
    })
    setBusy(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#0f172a' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#111827', borderRadius: 24, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
        <div style={{ color: '#ff9800', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>SK Volley</div>
        <div style={{ color: '#cbd5e1', marginBottom: 24 }}>Prijava za upravljanje klubom</div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Korisničko ime"
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc' }}
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Lozinka"
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc' }}
          />
          {error ? <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div> : null}
          <button
            type="submit"
            disabled={busy}
            style={{ border: 'none', borderRadius: 12, padding: '12px 14px', background: '#ff9800', color: '#111827', fontWeight: 800, cursor: 'pointer' }}
          >
            {busy ? 'Prijavljivanje...' : 'Prijavi se'}
          </button>
        </form>
      </div>
    </div>
  )
}
