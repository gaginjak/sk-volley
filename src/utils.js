export function parseDateOnly(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toLocalDateInput(value) {
  const date = parseDateOnly(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDate(value) {
  if (!value) return '-'
  const date = parseDateOnly(value)
  if (!date) return value
  return date.toLocaleDateString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateLong(value) {
  if (!value) return '-'
  const date = parseDateOnly(value)
  if (!date) return value
  return date.toLocaleDateString('sr-Latn-RS', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function calculateMedicalExpiry(value) {
  if (!value) return ''
  const date = parseDateOnly(value)
  if (!date) return ''
  const expiry = new Date(date)
  expiry.setMonth(expiry.getMonth() + 6)
  return toLocalDateInput(expiry)
}

export function parsePayments(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseGroupIds(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1)
      return inner ? inner.split(',').map((item) => item.trim()).filter(Boolean) : []
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function isAdminRole(role) {
  return role === 'admin' || role === 'Administrator' || role === 'superadmin'
}

export function stringifyPayments(value) {
  return JSON.stringify(value)
}

export function getMedicalStatus(medical) {
  if (!medical) return 'ok'
  const expiry = new Date(medical)
  if (Number.isNaN(expiry.getTime())) return 'ok'
  const now = new Date()
  const warningDate = new Date(now)
  warningDate.setDate(now.getDate() + 30)
  if (expiry < now) return 'expired'
  if (expiry <= warningDate) return 'soon'
  return 'ok'
}

export function getMedicalLabel(status) {
  if (status === 'expired') return 'Istekao'
  if (status === 'soon') return 'Uskoro ističe'
  return 'Važi'
}

export function getCurrentMonthKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function getMonthLabel(date = new Date()) {
  return date.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
}
