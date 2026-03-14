import assert from 'node:assert/strict'
import { __resetMobileProgressEtaStateForTest, mapExportProgressForMobile } from '../electron/mobileProgressPayload.mjs'

function run() {
  __resetMobileProgressEtaStateForTest()
  const now = '2026-03-14T10:00:00.000Z'

  const fromEta = mapExportProgressForMobile(
    {
      data: {
        status: 'running',
        progress: 50,
        current_snapshot: 3,
        total_snapshots: 6,
        current_snapshot_name: 'Vocal',
        eta_seconds: 120,
      },
    },
    now,
  )

  assert.equal(fromEta.status, 'running')
  assert.equal(fromEta.eta_seconds, 120)
  assert.equal(fromEta.eta_target_at, '2026-03-14T10:02:00.000Z')

  const fromProgress = mapExportProgressForMobile(
    {
      data: {
        status: 'running',
        progress: 25,
        current_snapshot: 1,
        total_snapshots: 4,
        started_at: '2026-03-14T09:58:00.000Z',
      },
    },
    now,
  )

  assert.equal(fromProgress.eta_seconds, null)
  assert.equal(fromProgress.eta_target_at, null)

  const afterFirstSnapshot = mapExportProgressForMobile(
    {
      data: {
        status: 'running',
        progress: 45,
        task_id: 'task_eta_1',
        current_snapshot: 2,
        total_snapshots: 4,
        started_at: '2026-03-14T09:58:00.000Z',
      },
    },
    now,
  )

  assert.ok(typeof afterFirstSnapshot.eta_seconds === 'number' && afterFirstSnapshot.eta_seconds > 0)
  assert.ok(typeof afterFirstSnapshot.eta_target_at === 'string' && afterFirstSnapshot.eta_target_at.length > 0)

  const stableTick = mapExportProgressForMobile(
    {
      data: {
        status: 'running',
        progress: 45,
        task_id: 'task_eta_1',
        current_snapshot: 2,
        total_snapshots: 4,
        eta_seconds: afterFirstSnapshot.eta_seconds,
      },
    },
    '2026-03-14T10:00:01.000Z',
  )

  assert.ok(
    typeof stableTick.eta_seconds === 'number' && stableTick.eta_seconds < (afterFirstSnapshot.eta_seconds as number),
    'eta should countdown when progress payload is stable',
  )
  assert.equal(stableTick.eta_target_at, afterFirstSnapshot.eta_target_at, 'estimated finish time should stay stable')

  const completed = mapExportProgressForMobile(
    {
      data: {
        status: 'completed',
        progress: 100,
      },
    },
    now,
  )

  assert.equal(completed.eta_seconds, null)
  assert.equal(completed.eta_target_at, null)

  process.stdout.write('PASS mobile progress payload\n')
}

try {
  run()
} catch (error) {
  process.stderr.write(`FAIL mobile progress payload: ${String(error)}\n`)
  process.exitCode = 1
}
