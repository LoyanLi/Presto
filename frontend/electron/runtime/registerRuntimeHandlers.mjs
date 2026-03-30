import { dialog, ipcMain, shell } from 'electron'
import {
  mkdir,
  readFile as readFileFs,
  readdir as readdirFs,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'

export function registerRuntimeHandlers({
  app,
  appLogStore,
  appendAppLog,
  applyDawTarget,
  automationRuntime,
  decorateMobileProgressResult,
  ensureMobileProgressRuntime,
  ensureSmokeImportAnalyzeFolder,
  ensureWindow,
  fetchLatestGithubRelease,
  getCurrentDawTarget,
  loadAppMetadata,
  loadBackendSupervisor,
  loadDawAdapterSnapshot,
  loadPluginHostService,
  macAccessibilityRuntime,
  normalizeErrorDetails,
  openLogInConsole,
  pathExists,
  readFsStat,
  setBackendDeveloperMode,
  smokeTarget,
  summarizeCapabilityResult,
}) {
  ipcMain.handle('app:get-version', async () => (await loadAppMetadata()).version)
  ipcMain.handle('app:get-latest-release', () => fetchLatestGithubRelease())
  ipcMain.handle('app:view-log', async () => {
    const filePath = appLogStore.getCurrentLogPath()
    try {
      await openLogInConsole(filePath)
      appendAppLog('info', 'electron.main', 'app_view_log_opened', { filePath })
      return {
        ok: true,
        filePath,
      }
    } catch (error) {
      appendAppLog('error', 'electron.main', 'app_view_log_failed', {
        filePath,
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('fs:read-file', async (_event, targetPath) => readFileFs(targetPath, 'utf8').catch(() => null))
  ipcMain.handle('fs:write-file', async (_event, targetPath, content) => {
    await writeFile(targetPath, content, 'utf8')
    return true
  })
  ipcMain.handle('fs:ensure-dir', async (_event, targetPath) => {
    await mkdir(targetPath, { recursive: true })
    return true
  })
  ipcMain.handle('fs:get-home-path', () => app.getPath('home'))
  ipcMain.handle('fs:exists', async (_event, targetPath) => pathExists(targetPath))
  ipcMain.handle('fs:stat', async (_event, targetPath) => readFsStat(targetPath))
  ipcMain.handle('fs:readdir', async (_event, targetPath) => readdirFs(targetPath))
  ipcMain.handle('fs:mkdir', async (_event, targetPath) => {
    await mkdir(targetPath, { recursive: true })
    return true
  })
  ipcMain.handle('fs:unlink', async (_event, targetPath) => {
    await unlink(targetPath)
    return true
  })
  ipcMain.handle('fs:rmdir', async (_event, targetPath) => {
    await rm(targetPath, { recursive: true, force: true })
    return true
  })
  ipcMain.handle('fs:delete-file', async (_event, targetPath) => {
    await unlink(targetPath)
    return true
  })
  ipcMain.handle('backend:get-status', async () => {
    const supervisor = await loadBackendSupervisor()
    return supervisor.getStatus()
  })
  ipcMain.handle('backend:get-daw-adapter-snapshot', async () => loadDawAdapterSnapshot())
  ipcMain.handle('backend:restart', async () => {
    try {
      const supervisor = await loadBackendSupervisor()
      await supervisor.stop()
      await supervisor.start()
      await supervisor.health()
      appendAppLog('info', 'backend.restart', 'backend_restart_completed', {
        targetDaw: getCurrentDawTarget(),
      })
      return { ok: true }
    } catch (error) {
      appendAppLog('error', 'backend.restart', 'backend_restart_failed', {
        targetDaw: getCurrentDawTarget(),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('backend:set-daw-target', async (_event, target) => {
    const resolvedTarget = await applyDawTarget(String(target))
    return { ok: true, target: resolvedTarget }
  })
  ipcMain.handle('backend:set-developer-mode', async (_event, enabled) => {
    try {
      const result = await setBackendDeveloperMode(enabled)
      appendAppLog('info', 'backend.settings', 'backend_set_developer_mode_completed', {
        enabled: result.enabled,
      })
      return result
    } catch (error) {
      appendAppLog('error', 'backend.settings', 'backend_set_developer_mode_failed', {
        enabled: Boolean(enabled),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('backend:invoke-capability', async (_event, request) => {
    const startedAt = Date.now()
    try {
      const supervisor = await loadBackendSupervisor()
      const response = await supervisor.invokeCapability(request)
      const summary = summarizeCapabilityResult(response)
      appendAppLog(summary.success ? 'info' : 'warn', 'backend.invoke', 'backend_invoke_capability_completed', {
        requestId: String(request?.requestId ?? ''),
        capability: String(request?.capability ?? ''),
        success: summary.success,
        errorCode: summary.errorCode,
        durationMs: Date.now() - startedAt,
      })
      return response
    } catch (error) {
      appendAppLog('error', 'backend.invoke', 'backend_invoke_capability_failed', {
        requestId: String(request?.requestId ?? ''),
        capability: String(request?.capability ?? ''),
        durationMs: Date.now() - startedAt,
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('plugins:list', async () => {
    const service = await loadPluginHostService()
    return service.listPlugins()
  })
  ipcMain.handle('plugins:install-directory', async (_event, overwrite = false) => {
    try {
      const service = await loadPluginHostService()
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Install Plugin From Local Directory',
      })
      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: false,
          cancelled: true,
          managedPluginsRoot: service.getManagedPluginsRoot(),
          issues: [],
        }
      }
      return service.installFromDirectory({
        selectedPath: result.filePaths[0],
        overwrite: Boolean(overwrite),
      })
    } catch (error) {
      appendAppLog('error', 'plugins', 'plugin_install_directory_failed', {
        overwrite: Boolean(overwrite),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('plugins:install-zip', async (_event, overwrite = false) => {
    try {
      const service = await loadPluginHostService()
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Install Plugin From Local Zip',
        filters: [{ name: 'Plugin Zip', extensions: ['zip'] }],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: false,
          cancelled: true,
          managedPluginsRoot: service.getManagedPluginsRoot(),
          issues: [],
        }
      }
      return service.installFromZip({
        zipPath: result.filePaths[0],
        overwrite: Boolean(overwrite),
      })
    } catch (error) {
      appendAppLog('error', 'plugins', 'plugin_install_zip_failed', {
        overwrite: Boolean(overwrite),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('plugins:uninstall', async (_event, pluginId) => {
    try {
      const service = await loadPluginHostService()
      return service.uninstall(String(pluginId))
    } catch (error) {
      appendAppLog('error', 'plugins', 'plugin_uninstall_failed', {
        pluginId: String(pluginId ?? ''),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('dialog:open', async (_event, options = {}) =>
    smokeTarget === 'developer-write'
      ? {
          canceled: false,
          filePaths: [await ensureSmokeImportAnalyzeFolder()],
        }
      : dialog.showOpenDialog({
          properties: ['openDirectory'],
          ...options,
        }),
  )
  ipcMain.handle('shell:open-path', async (_event, targetPath) => {
    try {
      return await shell.openPath(String(targetPath))
    } catch (error) {
      appendAppLog('error', 'shell', 'shell_open_path_failed', {
        targetPath: String(targetPath ?? ''),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('shell:open-external', async (_event, targetUrl) => {
    try {
      return await shell.openExternal(String(targetUrl))
    } catch (error) {
      appendAppLog('error', 'shell', 'shell_open_external_failed', {
        targetUrl: String(targetUrl ?? ''),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('window:toggle-always-on-top', async () => {
    const win = await ensureWindow()
    win.setAlwaysOnTop(!win.isAlwaysOnTop())
    return win.isAlwaysOnTop()
  })
  ipcMain.handle('window:get-always-on-top', async () => {
    const win = await ensureWindow()
    return win.isAlwaysOnTop()
  })
  ipcMain.handle('window:set-always-on-top', async (_event, enabled) => {
    const win = await ensureWindow()
    win.setAlwaysOnTop(Boolean(enabled))
    return win.isAlwaysOnTop()
  })
  ipcMain.handle('automation:list-definitions', async () => automationRuntime.listDefinitions())
  ipcMain.handle('automation:run-definition', async (_event, request) => {
    try {
      const result = await automationRuntime.runDefinition(request)
      appendAppLog('info', 'automation', 'automation_run_definition_completed', {
        definitionId: String(request?.definitionId ?? ''),
        ok: Boolean(result?.ok),
      })
      return result
    } catch (error) {
      appendAppLog('error', 'automation', 'automation_run_definition_failed', {
        definitionId: String(request?.definitionId ?? ''),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('mobileProgress:createSession', async (_event, taskId) => {
    try {
      const { runtime } = await ensureMobileProgressRuntime()
      const result = decorateMobileProgressResult(runtime.createSession(String(taskId)))
      appendAppLog('info', 'mobileProgress', 'mobile_progress_session_created', {
        taskId: String(taskId ?? ''),
        sessionId: String(result?.sessionId ?? ''),
      })
      return result
    } catch (error) {
      appendAppLog('error', 'mobileProgress', 'mobile_progress_session_create_failed', {
        taskId: String(taskId ?? ''),
        error: normalizeErrorDetails(error),
      })
      throw error
    }
  })
  ipcMain.handle('mobileProgress:closeSession', async (_event, sessionId) => {
    const { runtime } = await ensureMobileProgressRuntime()
    return runtime.closeSession(String(sessionId))
  })
  ipcMain.handle('mobileProgress:getViewUrl', async (_event, sessionId) => {
    const { runtime } = await ensureMobileProgressRuntime()
    return decorateMobileProgressResult(runtime.getViewUrl(String(sessionId)))
  })
  ipcMain.handle('mobileProgress:updateSession', async (_event, sessionId, payload) => {
    const { runtime } = await ensureMobileProgressRuntime()
    return runtime.updateSession(String(sessionId), payload)
  })
  ipcMain.handle('macAccessibility:preflight', async () => macAccessibilityRuntime.preflight())
  ipcMain.handle('macAccessibility:run-script', async (_event, script, args) =>
    macAccessibilityRuntime.runScript(script, args),
  )
  ipcMain.handle('macAccessibility:run-file', async (_event, scriptPath, args) =>
    macAccessibilityRuntime.runFile(scriptPath, args),
  )
}
