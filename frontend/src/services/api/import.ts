import {
  AppConfigDto,
  ImportAnalyzeItem,
  ImportRunState,
  RenameProposal,
  ResolvedImportItem,
} from '../../types/import'
import { httpRequest } from './httpClient'

export const importApi = {
  async health(): Promise<{ success: boolean; message: string; ptsl_connected: boolean }> {
    return httpRequest('GET', '/api/v1/system/health')
  },

  async getConfig(): Promise<AppConfigDto> {
    const payload = await httpRequest('GET', '/api/v1/config')
    return payload.data as AppConfigDto
  },

  async updateConfig(data: AppConfigDto & { api_key?: string }): Promise<void> {
    await httpRequest('PUT', '/api/v1/config', data)
  },

  async getAiKeyStatus(): Promise<boolean> {
    const payload = await httpRequest('GET', '/api/v1/ai/key/status')
    return Boolean(payload.has_key)
  },

  async setAiKey(apiKey: string): Promise<void> {
    await httpRequest('POST', '/api/v1/ai/key', { api_key: apiKey })
  },

  async preflight(): Promise<void> {
    await httpRequest('POST', '/api/v1/import/preflight')
  },

  async analyze(items: ImportAnalyzeItem[]): Promise<RenameProposal[]> {
    const payload = await httpRequest('POST', '/api/v1/import/ai-analyze', { items })
    return payload.proposals as RenameProposal[]
  },

  async finalize(
    proposals: RenameProposal[],
    manualNameByPath: Record<string, string>,
  ): Promise<{ proposals: RenameProposal[]; resolved_items: ResolvedImportItem[] }> {
    const payload = await httpRequest('POST', '/api/v1/import/finalize', {
      proposals,
      manual_name_by_path: manualNameByPath,
    })
    return {
      proposals: payload.proposals as RenameProposal[],
      resolved_items: payload.resolved_items as ResolvedImportItem[],
    }
  },

  async openStrip(): Promise<void> {
    await httpRequest('POST', '/api/v1/import/strip/open')
  },

  async runStart(items: ResolvedImportItem[]): Promise<string> {
    const payload = await httpRequest('POST', '/api/v1/import/run/start', { items })
    return payload.run_id as string
  },

  async runStatus(runId: string): Promise<ImportRunState> {
    const payload = await httpRequest('GET', `/api/v1/import/run/${runId}`)
    return payload.data as ImportRunState
  },

  async runStop(runId: string): Promise<void> {
    await httpRequest('POST', `/api/v1/import/run/stop/${runId}`)
  },

  async saveSession(): Promise<void> {
    await httpRequest('POST', '/api/v1/session/save')
  },
}
