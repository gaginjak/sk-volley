import test from 'node:test'
import assert from 'node:assert/strict'
import { createAttendanceSaveQueue } from './attendanceSaveQueue.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function setup(records = []) {
  const changes = []
  const requests = []
  const errors = []
  const queue = createAttendanceSaveQueue({
    records,
    groupId: 1,
    trainingDate: '2026-11-16',
    save(playerId, status, existing) {
      const request = { playerId, status, existing, ...deferred() }
      requests.push(request)
      return request.promise
    },
    onChange: (playerId, record) => changes.push({ playerId, record }),
    onError: (error, playerId) => errors.push({ error, playerId }),
  })
  return { queue, changes, requests, errors }
}

test('marking is immediate and a failed insert restores no record', async () => {
  const { queue, changes, requests, errors } = setup()
  queue.mark(10, 'p')
  assert.equal(changes[0].record.status, 'p')
  assert.equal(requests[0].existing, null)
  requests[0].reject(new Error('offline'))
  await tick()
  assert.equal(changes.at(-1).record, null)
  assert.equal(errors.length, 1)
})

test('failed update restores the previous saved record', async () => {
  const original = { id: 1, player_id: 10, status: 'absent' }
  const { queue, changes, requests, errors } = setup([original])
  queue.mark(10, 'p')
  assert.equal(changes.at(-1).record.status, 'p')
  assert.equal(requests[0].existing, original)
  requests[0].reject(new Error('offline'))
  await tick()
  assert.deepEqual(changes.at(-1).record, original)
  assert.equal(errors.length, 1)
})

test('rapid changes serialize insert and update without overwriting the latest click', async () => {
  const { queue, changes, requests, errors } = setup()
  queue.mark(10, 'p')
  queue.mark(10, 'absent')
  assert.equal(changes.at(-1).record.status, 'absent')
  assert.equal(requests.length, 1)
  const inserted = { id: 5, player_id: 10, status: 'p' }
  requests[0].resolve(inserted)
  await tick()
  assert.equal(changes.at(-1).record.status, 'absent')
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1].existing, inserted)
  assert.equal(requests[1].status, 'absent')
  requests[1].resolve({ ...inserted, status: 'absent' })
  await tick()
  assert.equal(changes.at(-1).record.status, 'absent')
  assert.equal(errors.length, 0)
})

test('failure of a superseded request preserves newer intent and retries it', async () => {
  const { queue, changes, requests, errors } = setup()
  queue.mark(10, 'p')
  queue.mark(10, 'absent')
  requests[0].reject(new Error('offline'))
  await tick()
  assert.equal(changes.at(-1).record.status, 'absent')
  assert.equal(errors.length, 1)
  assert.equal(requests[1].status, 'absent')
  assert.equal(requests[1].existing, null)
  requests[1].resolve({ id: 2, player_id: 10, status: 'absent' })
  await tick()
  assert.equal(changes.at(-1).record.status, 'absent')
})

test('later failure restores the last successful save and players save independently', async () => {
  const { queue, changes, requests } = setup()
  queue.mark(10, 'p')
  queue.mark(10, 'absent')
  queue.mark(11, 'p')
  assert.equal(requests.length, 2)
  const saved = { id: 5, player_id: 10, status: 'p' }
  requests[0].resolve(saved)
  await tick()
  assert.equal(requests.length, 3)
  requests[2].reject(new Error('offline'))
  await tick()
  assert.deepEqual(changes.at(-1), { playerId: 10, record: saved })
  requests[1].resolve({ id: 6, player_id: 11, status: 'p' })
  await tick()
  assert.equal(changes.at(-1).record.player_id, 11)
})