import { PropsWithChildren } from 'react'

export type AppView = 'home' | 'import' | 'export'

export function AppShell(
  props: PropsWithChildren<{
    appName: string
    subtitle: string
    currentView: AppView
    onChangeView: (view: AppView) => void
    apiOnline: boolean
    ptslConnected: boolean
    alwaysOnTop: boolean
    onToggleAlwaysOnTop: () => void
    onOpenAiSettings: () => void
    onOpenCategoryEditor: () => void
  }>,
) {
  const { appName, subtitle, currentView, onChangeView } = props

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-[240px]">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center">P</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 leading-tight">{appName}</h1>
            <p className="text-xs text-gray-600">{subtitle}</p>
          </div>
        </div>

        <nav className="flex items-center gap-2">
          {(['home', 'import', 'export'] as AppView[]).map((view) => (
            <button
              key={view}
              onClick={() => onChangeView(view)}
              className={`px-3 py-2 rounded-md text-sm capitalize ${
                currentView === view ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {view}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 min-w-[320px] justify-end">
          <button
            onClick={props.onOpenAiSettings}
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
          >
            AI Settings
          </button>
          <button
            onClick={props.onOpenCategoryEditor}
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Categories
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{props.children}</main>

      <footer className="bg-white border-t border-gray-200 px-6 py-2 flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <span>
            API: <span className={props.apiOnline ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{props.apiOnline ? 'Online' : 'Offline'}</span>
          </span>
          <span>
            Pro Tools: <span className={props.ptslConnected ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{props.ptslConnected ? 'Connected' : 'Disconnected'}</span>
          </span>
          <span>
            View: <span className="font-medium capitalize">{currentView}</span>
          </span>
        </div>
        <button
          onClick={props.onToggleAlwaysOnTop}
          className={`px-3 py-1.5 rounded-md text-xs border ${
            props.alwaysOnTop
              ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
          }`}
        >
          {props.alwaysOnTop ? 'Pinned On Top' : 'Pin Window'}
        </button>
      </footer>
    </div>
  )
}
