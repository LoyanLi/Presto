import type { FriendlyErrorView } from '../../errors/normalizeAppError'
import { useI18n } from '../../i18n'

type ErrorNoticeProps = {
  error: FriendlyErrorView | null
}

function toneClass(severity: FriendlyErrorView['severity']): string {
  if (severity === 'warn') {
    return 'bg-amber-50 border-amber-200 text-amber-800'
  }
  if (severity === 'info') {
    return 'bg-blue-50 border-blue-200 text-blue-800'
  }
  return 'bg-red-50 border-red-200 text-red-800'
}

export function ErrorNotice({ error }: ErrorNoticeProps) {
  const { t } = useI18n()
  if (!error) {
    return null
  }

  const keyPrefix = `error.code.${error.code}`
  const resolveKey = (key: string): string | null => {
    const value = t(key)
    return value === key ? null : value
  }

  const defaultTitle = resolveKey('error.default.title') ?? error.userTitle
  const defaultMessage = resolveKey('error.default.message') ?? error.userMessage
  const defaultActions = [1, 2, 3, 4, 5]
    .map((idx) => resolveKey(`error.default.action${idx}`))
    .filter((item): item is string => Boolean(item))

  const localizedTitle = resolveKey(`${keyPrefix}.title`) ?? defaultTitle
  const localizedMessage = resolveKey(`${keyPrefix}.message`) ?? defaultMessage
  const localizedActions = [1, 2, 3, 4, 5]
    .map((idx) => resolveKey(`${keyPrefix}.action${idx}`))
    .filter((item): item is string => Boolean(item))
  const finalActions = localizedActions.length > 0 ? localizedActions : (defaultActions.length > 0 ? defaultActions : error.actions)

  return (
    <div className={`border rounded-md p-3 space-y-2 ${toneClass(error.severity)}`}>
      <div className="font-semibold text-sm">{localizedTitle}</div>
      <div className="text-sm">{localizedMessage}</div>
      {finalActions.length > 0 ? (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {finalActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer font-medium">{t('error.details.toggle')}</summary>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-medium">{t('error.details.code')}</span> {error.code}
          </div>
          <div className="break-all">
            <span className="font-medium">{t('error.details.message')}</span> {error.technicalMessage}
          </div>
          {error.details ? (
            <pre className="whitespace-pre-wrap break-all rounded bg-black/5 p-2">
              {JSON.stringify(error.details, null, 2)}
            </pre>
          ) : null}
        </div>
      </details>
    </div>
  )
}
