export function getAttendanceWarnings(players, groups, attendance) {
  return players.map((player) => {
    const records = attendance
      .filter((item) => String(item.player_id) === String(player.id) && String(item.group_id) === String(player.gid))
      .sort((a, b) => String(b.training_date || '').localeCompare(String(a.training_date || '')))
    const missedDates = []
    for (const record of records) {
      if (record.status !== 'absent') break
      missedDates.push(record.training_date)
    }
    if (missedDates.length < 3) return null
    return { player, group: groups.find((item) => String(item.id) === String(player.gid)), missedDates }
  }).filter(Boolean)
}