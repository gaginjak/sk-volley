import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchGroupAttendance, formatAttendanceDate, getGroupAttendanceView, getPlayerAttendance } from './attendanceUtils.js'

const records = [
  { group_id: 1, player_id: 10, training_date: '2026-11-01', status: 'p' },
  { group_id: 1, player_id: 10, training_date: '2026-11-01', status: 'p' },
  { group_id: 1, player_id: 11, training_date: '2026-11-02', status: 'p' },
  { group_id: 1, player_id: 10, training_date: '2026-11-03', status: 'absent' },
  { group_id: 1, player_id: 10, training_date: '2026-10-01', status: 'present' },
  { group_id: 2, player_id: 10, training_date: '2026-11-04', status: 'p' },
  { group_id: 1, player_id: 10, training_date: null, status: 'p' },
]

test('only recorded group dates count, and only explicit p is present', () => {
  const result = getPlayerAttendance(records, '1', '10')
  assert.deepEqual(result.dates, ['2026-10-01', '2026-11-01', '2026-11-02', '2026-11-03'])
  assert.equal(result.presentCount, 1)
  assert.equal(result.absentCount, 1)
  assert.equal(result.percentage, 25)
  assert.equal(result.byDate.has('2026-11-02'), false)
  assert.equal(result.byDate.get('2026-10-01'), 'present')
})

test('monthly and group statistics share recorded group dates', () => {
  const month = getPlayerAttendance(records, 1, 10, '2026-11')
  assert.equal(month.dates.length, 3)
  assert.equal(month.percentage, 33)
  assert.equal(getPlayerAttendance(records, 1, 12, '2026-11').percentage, 0)
  assert.equal(getPlayerAttendance(records, 2, 10, '2026-11').percentage, 100)
  assert.equal(getPlayerAttendance(records, 1, 10, '2026-09').percentage, 0)
  assert.equal(getPlayerAttendance(records, null, null).percentage, 0)
})

test('duplicate mixed statuses count an explicit present once', () => {
  const duplicate = [...records, { group_id: 1, player_id: 10, training_date: '2026-11-03', status: 'p' }]
  const result = getPlayerAttendance(duplicate, 1, 10, '2026-11')
  assert.equal(result.presentCount, 2)
  assert.equal(result.absentCount, 0)
  assert.equal(result.percentage, 67)
})

test('fetches all pages even if the server limits page sizes', async () => {
  const ranges = []
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({
    range: async (start, end) => {
      ranges.push([start, end])
      return { data: records.slice(start, start + 2), count: records.length, error: null }
    },
  }) }) }) }) }
  const result = await fetchGroupAttendance(supabase, 1)
  assert.deepEqual(result.data, records)
  assert.equal(result.error, null)
  assert.deepEqual(ranges.map(([start]) => start), [0, 2, 4, 6])
})

test('does not silently use partial data after a fetch error', async () => {
  const error = new Error('fetch failed')
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({
    range: async () => ({ data: null, count: null, error }),
  }) }) }) }) }
  assert.deepEqual(await fetchGroupAttendance(supabase, 1), { data: null, error })
})

test('calendar dates and recorded-attendance denominators remain separate per group', () => {
  const trainings = [
    { gid: 1, date: '2026-11-08' },
    { gid: 1, date: '2026-11-01' },
    { gid: 1, date: '2026-11-01' },
    { gid: 2, date: '2026-11-04' },
    { gid: 1, date: '2026-10-01' },
  ]
  const result = getGroupAttendanceView(records, trainings, 1, [10], '2026-11')
  assert.deepEqual(result.dates, ['2026-11-01', '2026-11-08'])
  assert.equal(result.month.byDate.get('2026-11-01'), 'p')
  assert.equal(result.month.byDate.get('2026-11-08'), undefined)
  assert.equal(result.month.dates.length, 3)
  assert.equal(result.month.presentCount, 1)
  assert.equal(result.month.percentage, 33)
  assert.equal(result.season.dates.length, 4)
  assert.equal(result.season.percentage, 25)
  const otherGroup = getGroupAttendanceView(records, trainings, 2, [10], '2026-11')
  assert.deepEqual(otherGroup.dates, ['2026-11-04'])
  assert.equal(otherGroup.month.percentage, 100)
})

test('multiple player rows in one group count each date once', () => {
  const data = [...records, { group_id: 1, player_id: 12, training_date: '2026-11-02', status: 'p' }]
  const result = getGroupAttendanceView(data, [], 1, [10, 12], '2026-11')
  assert.equal(result.month.presentCount, 2)
  assert.equal(result.month.dates.length, 3)
  assert.equal(result.month.percentage, 67)
})

test('formats dates with Serbian weekday abbreviations', () => {
  const weekdays = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub']
  for (let day = 1; day <= 7; day += 1) {
    const formatted = formatAttendanceDate(`2026-11-0${day}`)
    assert.equal(formatted.date, `0${day}.11.2026`)
    assert.equal(formatted.weekday, weekdays[day - 1])
  }
})