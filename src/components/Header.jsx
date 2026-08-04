export function Header({ user, onLogout }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        background: '#111827',
        borderBottom: '1px solid #334155',
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#ff9800' }}>SK Volley</div>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>{user?.name || 'Korisnik'} • {user?.role === 'admin' ? 'Administrator' : 'Trener'}</div>
      </div>
      <button
        onClick={onLogout}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '8px 12px',
          background: '#ff9800',
          color: '#111827',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Odjavi se
      </button>
    </header>
  )
}
