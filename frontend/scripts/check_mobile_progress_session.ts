import assert from 'node:assert/strict'
import {
  createMobileProgressSession,
  closeMobileProgressSession,
  validateMobileProgressSession,
  __resetMobileProgressSessionsForTest,
} from '../electron/mobileProgressSession.mjs'

async function run(): Promise<void> {
  __resetMobileProgressSessionsForTest()

  const created = createMobileProgressSession('task_1')
  assert.ok(created.sessionId, 'sessionId should be generated')
  assert.ok(created.token, 'token should be generated')

  const valid = validateMobileProgressSession(created.sessionId, created.token)
  assert.ok(valid, 'session should validate before close')
  assert.equal(valid?.taskId, 'task_1', 'task id should match')

  const closed = closeMobileProgressSession(created.sessionId)
  assert.equal(closed, true, 'close should return true for active session')

  const invalid = validateMobileProgressSession(created.sessionId, created.token)
  assert.equal(invalid, null, 'closed session should not validate')

  const closeAgain = closeMobileProgressSession(created.sessionId)
  assert.equal(closeAgain, false, 'close should return false when already closed')

  process.stdout.write('PASS mobile progress session lifecycle\n')
}

run().catch((error) => {
  process.stderr.write(`FAIL mobile progress session lifecycle: ${String(error)}\n`)
  process.exitCode = 1
})
