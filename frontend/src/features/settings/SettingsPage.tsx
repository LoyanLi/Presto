import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../../i18n'
import { importApi } from '../../services/api/import'
import { AiNamingConfig, AppConfigDto } from '../../types/import'
import { AiSettingsDialog } from './ConfigDialogs'

export type SettingsSection = 'general' | 'ai' | 'developer'

type SettingsPageProps = {
  initialSection: SettingsSection
  focusToken: number
  onBackHome: () => void
  onOpenDeveloper: () => void
  onDeveloperModeChange: (enabled: boolean) => void
}

export function SettingsPage(props: SettingsPageProps) {
  const { locale, setLocale, t } = useI18n()
  const [config, setConfig] = useState<AppConfigDto | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [hasAiKey, setHasAiKey] = useState(false)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const loadConfig = async (): Promise<void> => {
    try {
      setBusy(true)
      const [cfg, hasKey] = await Promise.all([importApi.getConfig(), importApi.getAiKeyStatus()])
      setConfig(cfg)
      setHasAiKey(hasKey)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  useEffect(() => {
    setActiveSection(props.initialSection)
    if (props.initialSection === 'ai') {
      setShowAiSettings(true)
    }
  }, [props.initialSection, props.focusToken])

  const sectionButtons = useMemo(
    () =>
      [
        { key: 'general', label: t('settings.section.general') },
        { key: 'ai', label: t('settings.section.ai') },
        { key: 'developer', label: t('settings.section.developer') },
      ] as Array<{ key: SettingsSection; label: string }>,
    [t],
  )

  const persistConfig = async (nextConfig: AppConfigDto, message: string): Promise<void> => {
    try {
      setBusy(true)
      await importApi.updateConfig(nextConfig)
      setConfig(nextConfig)
      setInfo(message)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const saveAiSettings = async (nextAi: AiNamingConfig): Promise<void> => {
    if (!config) return
    try {
      setBusy(true)
      await importApi.updateConfig({
        ...config,
        ai_naming: nextAi,
        api_key: aiKeyInput.trim() ? aiKeyInput.trim() : undefined,
      })
      setConfig({ ...config, ai_naming: nextAi })
      if (aiKeyInput.trim()) {
        setHasAiKey(true)
      }
      setAiKeyInput('')
      setShowAiSettings(false)
      setInfo(t('settings.message.aiUpdated'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleGeneralPreference = async (name: 'logs_collapsed_by_default' | 'follow_system_theme'): Promise<void> => {
    if (!config) return
    const nextConfig: AppConfigDto = {
      ...config,
      ui_preferences: {
        ...config.ui_preferences,
        [name]: !config.ui_preferences[name],
      },
    }
    await persistConfig(nextConfig, t('settings.message.generalUpdated'))
  }

  const toggleDeveloperMode = async (): Promise<void> => {
    if (!config) return
    const nextEnabled = !config.ui_preferences.developer_mode_enabled
    if (nextEnabled) {
      const confirmed = window.confirm(
        t('settings.developer.confirmEnable'),
      )
      if (!confirmed) {
        return
      }
    }

    const nextConfig: AppConfigDto = {
      ...config,
      ui_preferences: {
        ...config.ui_preferences,
        developer_mode_enabled: nextEnabled,
      },
    }
    await persistConfig(nextConfig, nextEnabled ? t('settings.message.devEnabled') : t('settings.message.devDisabled'))
    props.onDeveloperModeChange(nextEnabled)
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t('settings.title')}</h1>
            <p className="text-sm text-gray-600">{t('settings.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={props.onBackHome}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('settings.backHome')}
            </button>
            <button
              onClick={() => void loadConfig()}
              disabled={busy}
              className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              {t('settings.refresh')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sectionButtons.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                activeSection === item.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</div> : null}
        {info ? <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{info}</div> : null}

        {!config ? (
          <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg p-4">{t('settings.loading')}</div>
        ) : (
          <section className="bg-white border border-blue-300 rounded-lg p-5 space-y-3 min-h-[260px]">
            {activeSection === 'general' ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.general.title')}</h2>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.ui_preferences.logs_collapsed_by_default}
                      onChange={() => void toggleGeneralPreference('logs_collapsed_by_default')}
                      disabled={busy}
                    />
                    <span>{t('settings.general.collapseLogs')}</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.ui_preferences.follow_system_theme}
                      onChange={() => void toggleGeneralPreference('follow_system_theme')}
                      disabled={busy}
                    />
                    <span>{t('settings.general.followSystemTheme')}</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <span>{t('settings.general.language')}</span>
                    <select
                      value={locale}
                      onChange={(event) => setLocale(event.target.value as 'en-US' | 'zh-CN')}
                      className="px-2 py-1 border border-gray-300 rounded-md"
                    >
                      <option value="en-US">{t('settings.language.en-US')}</option>
                      <option value="zh-CN">{t('settings.language.zh-CN')}</option>
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            {activeSection === 'ai' ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.ai.title')}</h2>
                <div className="text-sm text-gray-700">
                  <div>{t('settings.ai.model', { value: config.ai_naming.model })}</div>
                  <div>{t('settings.ai.baseUrl', { value: config.ai_naming.base_url })}</div>
                  <div>{hasAiKey ? t('settings.ai.apiKeyStored') : t('settings.ai.apiKeyMissing')}</div>
                </div>
                <button
                  onClick={() => setShowAiSettings(true)}
                  className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  {t('settings.ai.edit')}
                </button>
              </>
            ) : null}

            {activeSection === 'developer' ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{t('settings.developer.title')}</h2>
                <p className="text-sm text-gray-600">{t('settings.developer.desc')}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void toggleDeveloperMode()}
                    disabled={busy}
                    className={`px-3 py-2 text-sm rounded-md border ${
                      config.ui_preferences.developer_mode_enabled
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-white text-gray-700 border-gray-300'
                    } disabled:opacity-50`}
                  >
                    {config.ui_preferences.developer_mode_enabled
                      ? t('settings.developer.disable')
                      : t('settings.developer.enable')}
                  </button>
                  {config.ui_preferences.developer_mode_enabled ? (
                    <button
                      onClick={props.onOpenDeveloper}
                      className="px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-black"
                    >
                      {t('settings.developer.openPage')}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        )}
      </div>

      {showAiSettings && config ? (
        <AiSettingsDialog
          current={config.ai_naming}
          hasKey={hasAiKey}
          apiKeyInput={aiKeyInput}
          onApiKeyInput={setAiKeyInput}
          onCancel={() => setShowAiSettings(false)}
          onSave={(nextAi) => void saveAiSettings(nextAi)}
        />
      ) : null}
    </div>
  )
}
