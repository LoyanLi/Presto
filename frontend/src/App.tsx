import { useEffect, useMemo, useState } from 'react'

import { Track2DoExportWorkflow } from './features/export/Track2DoExportWorkflow'
import { ImportWorkflow } from './features/import/ImportWorkflow'
import { DeveloperPage } from './features/settings/DeveloperPage'
import { SettingsPage, SettingsSection } from './features/settings/SettingsPage'
import { useI18n } from './i18n'
import { importApi } from './services/api/import'

type View = 'home' | 'import' | 'export' | 'settings' | 'developer'

export default function App() {
  const { t } = useI18n()
  const [view, setView] = useState<View>('home')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [settingsFocusToken, setSettingsFocusToken] = useState(0)
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(false)

  const hasElectronBackend = useMemo(() => {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.backend)
  }, [])

  const openSettings = (section: SettingsSection = 'general') => {
    setSettingsSection(section)
    setSettingsFocusToken((prev) => prev + 1)
    setView('settings')
  }

  const openDeveloper = () => {
    if (!developerModeEnabled) {
      openSettings('developer')
      return
    }
    setView('developer')
  }

  const activateModeForView = async (targetView: View) => {
    if (!window.electronAPI?.backend) {
      return
    }
    if (targetView !== 'import' && targetView !== 'export') {
      return
    }
    try {
      await window.electronAPI.backend.activateMode(targetView)
    } catch {
      // Keep workflow visible even if mode activation fails.
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await importApi.getConfig()
        setDeveloperModeEnabled(Boolean(cfg.ui_preferences.developer_mode_enabled))
      } catch {
        setDeveloperModeEnabled(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!hasElectronBackend) {
      return
    }
    void activateModeForView(view)
  }, [view, hasElectronBackend])

  useEffect(() => {
    if (!hasElectronBackend || !window.electronAPI?.backend?.setDeveloperMode) {
      return
    }
    void window.electronAPI.backend.setDeveloperMode(developerModeEnabled).catch(() => {
      // Keep UI usable even if electron bridge is temporarily unavailable.
    })
  }, [developerModeEnabled, hasElectronBackend])

  useEffect(() => {
    if (view === 'developer' && !developerModeEnabled) {
      openSettings('developer')
    }
  }, [view, developerModeEnabled])

  return (
    <div className="h-screen w-screen bg-gray-100 relative overflow-hidden">
      {view === 'home' ? (
        <div className="h-full overflow-auto px-6 py-10">
          <div className="max-w-6xl mx-auto space-y-5">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-1">Presto</h1>
              <p className="text-sm text-gray-600 mb-6">{t('app.home.chooseWorkflow')}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('app.home.importTitle')}</h2>
                <button
                  onClick={() => setView('import')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {t('app.home.openImport')}
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('app.home.exportTitle')}</h2>
                <button
                  onClick={() => setView('export')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {t('app.home.openExport')}
                </button>
              </div>
            </div>

            <div className={`grid gap-4 ${developerModeEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('app.home.settingsTitle')}</h2>
                <button
                  onClick={() => openSettings('general')}
                  className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-black"
                >
                  {t('app.home.openSettings')}
                </button>
              </div>

              {developerModeEnabled ? (
                <div className="bg-white border border-amber-200 rounded-lg p-5">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('app.home.developerTitle')}</h2>
                  <p className="text-xs text-amber-700 mb-3">{t('app.home.developerEnabled')}</p>
                  <button
                    onClick={openDeveloper}
                    className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                  >
                    {t('app.home.openDeveloper')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {view === 'import' ? (
        <ImportWorkflow
          onBackHome={() => setView('home')}
          onOpenAiSettings={() => openSettings('ai')}
        />
      ) : null}

      {view === 'export' ? <Track2DoExportWorkflow onBackHome={() => setView('home')} /> : null}

      {view === 'settings' ? (
        <SettingsPage
          initialSection={settingsSection}
          focusToken={settingsFocusToken}
          onBackHome={() => setView('home')}
          onOpenDeveloper={openDeveloper}
          onDeveloperModeChange={setDeveloperModeEnabled}
        />
      ) : null}

      {view === 'developer' ? (
        <DeveloperPage onBackHome={() => setView('home')} onBackSettings={() => openSettings('developer')} />
      ) : null}
    </div>
  )
}
