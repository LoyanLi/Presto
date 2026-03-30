export function createMobileProgressServer(options) {
  const sessions = new Map()
  const now = options.now ?? (() => new Date().toISOString())
  const createSessionId = options.createSessionId ?? (() => `mob_${randomFragment(12)}`)
  const createToken = options.createToken ?? (() => `${randomFragment(16)}${randomFragment(16)}`)

  function getSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session) {
      return null
    }
    return { ...session }
  }

  function createSession(taskId) {
    const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : ''
    if (!normalizedTaskId) {
      return { ok: false, error: 'Task ID is required.' }
    }

    const sessionId = createSessionId()
    const token = createToken()
    const createdAt = now()
    const session = {
      sessionId,
      token,
      taskId: normalizedTaskId,
      latestJobView: null,
      createdAt,
      updatedAt: createdAt,
      active: true,
      closedAt: null,
    }

    sessions.set(sessionId, session)

    return {
      ok: true,
      sessionId,
      url: options.buildViewUrl(sessionId, token),
    }
  }

  function closeSession(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalizedSessionId) {
      return { ok: false }
    }

    const session = sessions.get(normalizedSessionId)
    if (!session || !session.active) {
      return { ok: false }
    }

    const closedAt = now()
    sessions.set(normalizedSessionId, {
      ...session,
      active: false,
      closedAt,
      updatedAt: closedAt,
    })

    return { ok: true }
  }

  function getViewUrl(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalizedSessionId) {
      return { ok: false, error: 'Session ID is required.' }
    }

    const session = sessions.get(normalizedSessionId)
    if (!session || !session.active) {
      return { ok: false, error: 'Session is not active.' }
    }

    return {
      ok: true,
      sessionId: session.sessionId,
      url: options.buildViewUrl(session.sessionId, session.token),
    }
  }

  function updateSession(sessionId, payload) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    if (!normalizedSessionId) {
      return { ok: false, error: 'Session ID is required.' }
    }

    const session = sessions.get(normalizedSessionId)
    if (!session || !session.active) {
      return { ok: false, error: 'Session is not active.' }
    }

    const updatedAt = now()
    sessions.set(normalizedSessionId, {
      ...session,
      latestJobView: payload && typeof payload === 'object' ? structuredClone(payload) : null,
      updatedAt,
    })

    return { ok: true, sessionId: normalizedSessionId, updatedAt }
  }

  function clearSessions() {
    sessions.clear()
  }

  return {
    createSession,
    closeSession,
    getViewUrl,
    updateSession,
    getSession,
    clearSessions,
  }
}

function randomFragment(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return output
}
