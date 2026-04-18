import { useEffect, useRef, useState } from 'react'

import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { AppLatestReleaseInfo } from '@presto/sdk-runtime/clients/app'
import {
  createDefaultRequiredHostPermissions,
  getMissingRequiredHostPermissions,
  scanRequiredHostPermissions,
  type HostPermissionStatus,
} from './requiredPermissions'

export interface UseHostShellRuntimeStateInput {
  developerRuntime: PrestoRuntime
  preferencesHydrated: boolean
  includePrereleaseUpdates: boolean
  defaultReleasePageUrl: string
  macAccessibilitySettingsUrl: string
  macAccessibilityPermissionRequiredCode: string
  macAccessibilityPreflight?: PrestoRuntime['macAccessibility']['preflight']
}

export interface UseHostShellRuntimeStateResult {
  appVersion: string
  latestRelease: AppLatestReleaseInfo | null
  checkingUpdate: boolean
  updateError: string
  hasUpdate: boolean
  showUpdateDialog: boolean
  showMacAccessibilityDialog: boolean
  checkingPermissions: boolean
  permissionStatus: HostPermissionStatus[]
  missingRequiredPermissions: HostPermissionStatus[]
  setShowUpdateDialog(next: boolean): void
  setShowMacAccessibilityDialog(next: boolean): void
  setLatestRelease(next: AppLatestReleaseInfo | null): void
  setHasUpdate(next: boolean): void
  setUpdateError(next: string): void
  checkForUpdates(options?: { silent?: boolean }): Promise<void>
  checkRequiredPermissions(options?: { promptWhenMissing?: boolean }): Promise<HostPermissionStatus[]>
  openReleasePage(): Promise<boolean>
  openMacAccessibilitySettings(): Promise<boolean>
}

export function useHostShellRuntimeState({
  developerRuntime,
  preferencesHydrated,
  includePrereleaseUpdates,
  defaultReleasePageUrl,
  macAccessibilitySettingsUrl,
  macAccessibilityPermissionRequiredCode,
  macAccessibilityPreflight,
}: UseHostShellRuntimeStateInput): UseHostShellRuntimeStateResult {
  const [appVersion, setAppVersion] = useState('-')
  const [latestRelease, setLatestRelease] = useState<AppLatestReleaseInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showMacAccessibilityDialog, setShowMacAccessibilityDialog] = useState(false)
  const [checkingPermissions, setCheckingPermissions] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<HostPermissionStatus[]>(() =>
    createDefaultRequiredHostPermissions({ macAccessibilityAvailable: true }),
  )
  const startupUpdateCheckCompleteRef = useRef(false)
  const startupPermissionCheckCompleteRef = useRef(false)
  const updatePromptShownRef = useRef(false)

  useEffect(() => {
    if (!developerRuntime?.app?.getVersion) {
      return
    }

    let cancelled = false
    void developerRuntime.app.getVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version || '-')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion('-')
        }
      })

    return () => {
      cancelled = true
    }
  }, [developerRuntime])

  const openReleasePage = async (): Promise<boolean> => {
    const releaseUrl = latestRelease?.htmlUrl || defaultReleasePageUrl
    if (!releaseUrl || !developerRuntime?.shell?.openExternal) {
      return false
    }

    try {
      setUpdateError('')
      await developerRuntime.shell.openExternal(releaseUrl)
      return true
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  const openMacAccessibilitySettings = async (): Promise<boolean> => {
    if (!developerRuntime?.shell?.openExternal) {
      return false
    }

    try {
      await developerRuntime.shell.openExternal(macAccessibilitySettingsUrl)
      return true
    } catch {
      return false
    }
  }

  const checkForUpdates = async ({ silent = false }: { silent?: boolean } = {}): Promise<void> => {
    if (!developerRuntime?.app?.checkForUpdates || !developerRuntime?.app?.getVersion) {
      return
    }

    try {
      setCheckingUpdate(true)
      if (!silent) {
        setUpdateError('')
      }
      const currentVersion = await developerRuntime.app.getVersion()
      const result = await developerRuntime.app.checkForUpdates({
        currentVersion,
        includePrerelease: includePrereleaseUpdates,
      })
      setAppVersion(result.currentVersion || currentVersion || '-')
      setLatestRelease(result.latestRelease)
      setHasUpdate(result.hasUpdate)
      if (result.hasUpdate && result.latestRelease && !updatePromptShownRef.current) {
        updatePromptShownRef.current = true
        setShowUpdateDialog(true)
      }
    } catch (error) {
      if (!silent) {
        setUpdateError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setCheckingUpdate(false)
    }
  }

  const checkRequiredPermissions = async ({
    promptWhenMissing = false,
  }: {
    promptWhenMissing?: boolean
  } = {}): Promise<HostPermissionStatus[]> => {
    try {
      setCheckingPermissions(true)
      const permissions = await scanRequiredHostPermissions({
        macAccessibilityPreflight,
        macAccessibilityPermissionRequiredCode,
      })
      const missingPermissions = getMissingRequiredHostPermissions(permissions)

      setPermissionStatus(permissions)
      if (!missingPermissions.some((permission) => permission.id === 'macAccessibility')) {
        setShowMacAccessibilityDialog(false)
      } else if (promptWhenMissing) {
        setShowMacAccessibilityDialog(true)
      }

      return permissions
    } catch {
      const fallbackPermissions = createDefaultRequiredHostPermissions({ macAccessibilityAvailable: true })
      setPermissionStatus(fallbackPermissions)
      return fallbackPermissions
    } finally {
      setCheckingPermissions(false)
    }
  }

  useEffect(() => {
    if (!preferencesHydrated || startupUpdateCheckCompleteRef.current) {
      return
    }
    if (!developerRuntime?.app?.checkForUpdates || !developerRuntime?.app?.getVersion) {
      startupUpdateCheckCompleteRef.current = true
      return
    }

    startupUpdateCheckCompleteRef.current = true
    void checkForUpdates({ silent: true })
  }, [developerRuntime, preferencesHydrated, includePrereleaseUpdates])

  useEffect(() => {
    if (startupPermissionCheckCompleteRef.current) {
      return
    }

    startupPermissionCheckCompleteRef.current = true
    void checkRequiredPermissions({ promptWhenMissing: true })
  }, [macAccessibilityPermissionRequiredCode, macAccessibilityPreflight])

  const missingRequiredPermissions = getMissingRequiredHostPermissions(permissionStatus)

  return {
    appVersion,
    latestRelease,
    checkingUpdate,
    updateError,
    hasUpdate,
    showUpdateDialog,
    showMacAccessibilityDialog,
    checkingPermissions,
    permissionStatus,
    missingRequiredPermissions,
    setShowUpdateDialog,
    setShowMacAccessibilityDialog,
    setLatestRelease,
    setHasUpdate,
    setUpdateError,
    checkForUpdates,
    checkRequiredPermissions,
    openReleasePage,
    openMacAccessibilitySettings,
  }
}
