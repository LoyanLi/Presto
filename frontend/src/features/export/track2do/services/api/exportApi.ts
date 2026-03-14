import { HttpClient } from './httpClient'

export class ExportApi {
  constructor(private readonly http: HttpClient) {}

  async startExport(exportRequest: any): Promise<any> {
    try {
      return await this.http.request('POST', '/api/v1/export/start', exportRequest)
    } catch (error) {
      console.error('Failed to start export:', error)
      throw error
    }
  }

  async getExportStatus(taskId: string): Promise<any> {
    try {
      return await this.http.request('GET', `/api/v1/export/status/${taskId}`)
    } catch (error) {
      console.error('Failed to get export status:', error)
      throw error
    }
  }

  async getExportTasks(): Promise<any> {
    try {
      return await this.http.request('GET', '/api/v1/export/tasks')
    } catch (error) {
      console.error('Failed to get export tasks:', error)
      throw error
    }
  }

  async stopExportTask(taskId: string): Promise<any> {
    try {
      return await this.http.request('POST', `/api/v1/export/stop/${taskId}`)
    } catch (error) {
      console.error('Failed to stop export task:', error)
      throw error
    }
  }

  async deleteExportTask(taskId: string): Promise<any> {
    try {
      return await this.http.request('DELETE', `/api/v1/export/tasks/${taskId}`)
    } catch (error) {
      console.error('Failed to delete export task:', error)
      throw error
    }
  }
}
