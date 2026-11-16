export function createAttendanceSaveQueue({ records, groupId, trainingDate, save, onChange, onError }) {
  const players = new Map()
  for (const record of records) {
    const key = String(record.player_id)
    if (!players.has(key)) players.set(key, { confirmed: record, running: false, revision: 0 })
  }

  async function flush(playerId, entry) {
    entry.running = true
    while (true) {
      const revision = entry.revision
      const status = entry.desired
      try {
        const saved = await save(playerId, status, entry.confirmed)
        entry.confirmed = saved
        if (revision === entry.revision) {
          onChange(playerId, saved)
          break
        }
      } catch (error) {
        onError(error, playerId)
        if (revision === entry.revision) {
          onChange(playerId, entry.confirmed || null)
          break
        }
      }
    }
    entry.running = false
  }

  return {
    mark(playerId, status) {
      const key = String(playerId)
      let entry = players.get(key)
      if (!entry) {
        entry = { confirmed: null, running: false, revision: 0 }
        players.set(key, entry)
      }
      entry.desired = status
      entry.revision += 1
      onChange(playerId, {
        ...entry.confirmed,
        player_id: playerId,
        group_id: groupId,
        training_date: trainingDate,
        status,
      })
      if (!entry.running) void flush(playerId, entry)
    },
  }
}