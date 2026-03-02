import axios from 'axios'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const API_BASE_URL = 'http://127.0.0.1:8000'

function normalizeUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE_URL}${path}`
}

async function requestViaElectron(method: HttpMethod, url: string, data?: unknown): Promise<any> {
  if (!window.electronAPI) {
    throw new Error('electronAPI is unavailable')
  }
  switch (method) {
    case 'GET':
      return window.electronAPI.http.get(url)
    case 'POST':
      return window.electronAPI.http.post(url, data)
    case 'PUT':
      return window.electronAPI.http.put(url, data)
    case 'DELETE':
      return window.electronAPI.http.delete(url)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

async function requestViaAxios(method: HttpMethod, url: string, data?: unknown): Promise<any> {
  const response = await axios({
    method,
    url,
    data,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  })
  return response.data
}

export async function httpRequest(method: HttpMethod, path: string, data?: unknown): Promise<any> {
  const url = normalizeUrl(path)
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)
  if (isElectron) {
    return requestViaElectron(method, url, data)
  }
  return requestViaAxios(method, url, data)
}
