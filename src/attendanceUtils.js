// Attendance is keyed by group and date; multiple calendar entries on a date
// cannot be distinguished without a training ID in the attendance records.
export function getPlayerAttendance(records, groupId, playerId, monthKey = '') {
  const groupRecords = records.filter((record) =>
    groupId != null && String(record.group_id) === String(groupId) &&
    typeof record.training_date === 'string' && record.training_date &&
    (!monthKey || record.training_date.startsWith(`${monthKey}-`)),
  )
  const dates = [...new Set(groupRecords.map((record) => record.training_date))].sort()
  const playerRecords = groupRecords.filter((record) =>
    playerId != null && String(record.player_id) === String(playerId),
  )
  const byDate = new Map()
  for (const record of playerRecords) {
    // A duplicate row must not cause a date to be counted more than once.
    if (!byDate.has(record.training_date) || record.status === 'p') {
      byDate.set(record.training_date, record.status)
    }
  }
  const presentCount = dates.filter((date) => byDate.get(date) === 'p').length
  const absentCount = dates.filter((date) => ['absent', 'a'].includes(byDate.get(date))).length
  return {
    dates,
    byDate,
    playerRecords,
    presentCount,
    absentCount,
    percentage: dates.length ? Math.round((presentCount / dates.length) * 100) : 0,
  }
}

export async function fetchGroupAttendance(supabase, groupId) {
  const pageSize = 1000
  const records = []
  for (let offset = 0; ; ) {
    const { data, error, count } = await supabase.from('attendance').select('*', { count: 'exact' })
      .eq('group_id', groupId).order('id').range(offset, offset + pageSize - 1)
    if (error) return { data: null, error }
    const page = data || []
    records.push(...page)
    offset += page.length
    if (count != null ? offset >= count : page.length < pageSize) return { data: records, error: null }
    if (!page.length) return { data: null, error: new Error('Could not fetch all group attendance records') }
  }
}

export function getGroupAttendanceView(records, trainings, groupId, playerIds, monthKey) {
  const ids = new Set(playerIds.map(String))
  // The same member may have multiple player rows in a group.
  const matchingRecords = records.map((record) => ids.has(String(record.player_id))
    ? { ...record, player_id: '__selected_member__' }
    : record)
  const season = getPlayerAttendance(matchingRecords, groupId, '__selected_member__')
  const month = getPlayerAttendance(matchingRecords, groupId, '__selected_member__', monthKey)
  const dates = [...new Set(trainings
    .filter((training) => String(training.gid) === String(groupId) &&
      typeof training.date === 'string' && training.date.startsWith(`${monthKey}-`))
    .map((training) => training.date))].sort()
  return { dates, month, season }
}

export function formatAttendanceDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return { date, weekday: '' }
  const [, year, month, day] = match
  const weekday = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'][new Date(Number(year), Number(month) - 1, Number(day)).getDay()]
  return { date: `${day}.${month}.${year}`, weekday }
}