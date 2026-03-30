export interface MobileProgressCreateSessionResult {
  ok: boolean
  sessionId?: string
  url?: string
  qrSvg?: string
  error?: string
}

export interface MobileProgressGetViewUrlResult {
  ok: boolean
  sessionId?: string
  url?: string
  qrSvg?: string
  error?: string
}

export interface MobileProgressUpdateSessionResult {
  ok: boolean
  sessionId?: string
  updatedAt?: string
  error?: string
}

export interface MobileProgressRuntimeClient {
  createSession(taskId: string): Promise<MobileProgressCreateSessionResult>
  closeSession(sessionId: string): Promise<{ ok: boolean }>
  getViewUrl(sessionId: string): Promise<MobileProgressGetViewUrlResult>
  updateSession(sessionId: string, payload: unknown): Promise<MobileProgressUpdateSessionResult>
}
