import crypto from 'node:crypto'

const sessions = new Map()

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

function safeTokenMatch(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') {
    return false
  }

  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    return false
  }
  return crypto.timingSafeEqual(a, b)
}

export function createMobileProgressSession(taskId) {
  if (typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new Error('taskId is required')
  }

  const sessionId = randomId('mob')
  const token = crypto.randomBytes(24).toString('base64url')
  const createdAt = nowIso()

  const session = {
    sessionId,
    token,
    taskId: taskId.trim(),
    mode: 'export',
    createdAt,
    updatedAt: createdAt,
    active: true,
    closedAt: null,
  }

  sessions.set(sessionId, session)
  return { sessionId, token, createdAt }
}

export function getMobileProgressSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return null
  }
  const session = sessions.get(sessionId)
  return session ? { ...session } : null
}

export function closeMobileProgressSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session || !session.active) {
    return false
  }

  const closedAt = nowIso()
  session.active = false
  session.closedAt = closedAt
  session.updatedAt = closedAt
  sessions.set(sessionId, session)
  return true
}

export function validateMobileProgressSession(sessionId, token) {
  const session = sessions.get(sessionId)
  if (!session || !session.active) {
    return null
  }
  if (!safeTokenMatch(token, session.token)) {
    return null
  }
  return { ...session }
}

export function clearMobileProgressSessions() {
  sessions.clear()
}

export function __resetMobileProgressSessionsForTest() {
  clearMobileProgressSessions()
}
