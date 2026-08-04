export function BottomNav({ current, onNavigate }) {
  const items = [
    { key: 'calendar', label: 'Kalendar' },
    { key: 'groups', label: 'Grupe' },
    { key: 'statistics', label: 'Statistika' },
  ]

  return (
    <nav
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: 12,
        background: '#111827',
        borderTop: '1px solid #334155',
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          style={{
            border: current === item.key ? '1px solid #ff9800' : '1px solid #334155',
            background: current === item.key ? '#1f2937' : '#0f172a',
            color: current === item.key ? '#ff9800' : '#f8fafc',
            borderRadius: 12,
            padding: '10px 6px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
