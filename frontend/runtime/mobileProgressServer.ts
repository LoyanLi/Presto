export interface MobileProgressSessionRecord {
  sessionId: string
  token: string
  taskId: string
  createdAt: string
  updatedAt: string
  active: boolean
  closedAt: string | null
}

export interface MobileProgressCreateSessionResult {
  ok: boolean
  sessionId?: string
  url?: string
  error?: string
}

export interface MobileProgressGetViewUrlResult {
  ok: boolean
  sessionId?: string
  url?: string
  error?: string
}

export interface MobileProgressServerOptions {
  buildViewUrl(sessionId: string, token: string): string
  now?: () => string
  createSessionId?: () => string
  createToken?: () => string
}

export interface MobileProgressServer {
  createSession(taskId: string): MobileProgressCreateSessionResult
  closeSession(sessionId: string): { ok: boolean }
  getViewUrl(sessionId: string): MobileProgressGetViewUrlResult
  getSession(sessionId: string): MobileProgressSessionRecord | null
  clearSessions(): void
}

function nowIso(): string {
  return new Date().toISOString()
}

function randomFragment(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return output
}

function defaultSessionId(): string {
  return `mob_${randomFragment(12)}`
}

function defaultToken(): string {
  return `${randomFragment(16)}${randomFragment(16)}`
}

export function createMobileProgressServer(options: MobileProgressServerOptions): MobileProgressServer {
  const sessions = new Map<string, MobileProgressSessionRecord>()
  const now = options.now ?? nowIso
  const createSessionId = options.createSessionId ?? defaultSessionId
  const createToken = options.createToken ?? defaultToken

  function getSession(sessionId: string): MobileProgressSessionRecord | null {
    const session = sessions.get(sessionId)
    if (!session) {
      return null
    }
    return { ...session }
  }

  function createSession(taskId: string): MobileProgressCreateSessionResult {
    const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : ''
    if (!normalizedTaskId) {
      return { ok: false, error: 'Task ID is required.' }
    }

    const sessionId = createSessionId()
    const token = createToken()
    const createdAt = now()
    const session: MobileProgressSessionRecord = {
      sessionId,
      token,
      taskId: normalizedTaskId,
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

  function closeSession(sessionId: string): { ok: boolean } {
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

  function getViewUrl(sessionId: string): MobileProgressGetViewUrlResult {
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

  function clearSessions(): void {
    sessions.clear()
  }

  return {
    createSession,
    closeSession,
    getViewUrl,
    getSession,
    clearSessions,
  }
}
