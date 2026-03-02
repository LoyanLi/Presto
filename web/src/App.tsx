import { useState } from 'react'

import { Track2DoExportWorkflow } from './features/export/Track2DoExportWorkflow'
import { ImportWorkflow } from './features/import/ImportWorkflow'

type View = 'home' | 'import' | 'export'

export default function App() {
  const [view, setView] = useState<View>('home')

  return (
    <div className="h-screen w-screen bg-gray-100 relative overflow-hidden">
      {view === 'home' ? (
        <div className="h-full overflow-auto px-6 py-10">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-semibold text-gray-900 mb-1">Presto</h1>
            <p className="text-sm text-gray-600 mb-6">Choose a workflow.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Import</h2>
                <button
                  onClick={() => setView('import')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Open Import
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Export</h2>
                <button
                  onClick={() => setView('export')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Open Export
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {view === 'import' ? (
        <ImportWorkflow onBackHome={() => setView('home')} />
      ) : null}

      {view === 'export' ? (
        <Track2DoExportWorkflow onBackHome={() => setView('home')} />
      ) : null}
    </div>
  )
}
