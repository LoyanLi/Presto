import { useState } from 'react'

import { WorkflowActionBar } from '../../components/workflow/WorkflowActionBar'
import { WorkflowCard } from '../../components/workflow/WorkflowCard'
import { WorkflowStepper } from '../../components/workflow/WorkflowStepper'
import { WorkflowTitle } from '../../components/workflow/WorkflowTitle'
import ExportPanel from './track2do/components/ExportPanel'
import { SnapshotPanel } from './track2do/components/SnapshotPanel'
import { TrackList } from './track2do/components/TrackList'
import { useProToolsConnection } from './track2do/hooks/useProToolsConnection'
import { useSnapshots } from './track2do/hooks/useSnapshots'
import { formatBitDepthLabel } from './track2do/utils/bitDepth'

export function Track2DoExportWorkflow(props: { onBackHome?: () => void }) {
  const { isConnected, sessionName, sampleRate, bitDepth, tracks, refreshTracks } = useProToolsConnection()
  const { snapshots, createSnapshot, deleteSnapshot, updateSnapshot, getStorageInfo } = useSnapshots()

  const [currentStep, setCurrentStep] = useState(1)
  const stepNames = ['Project Info', 'Snapshot Management', 'Export Settings']

  const handleCreateSnapshot = (name: string) => {
    const trackStates = tracks.map((track) => ({
      trackId: track.id,
      trackName: track.name,
      is_soloed: track.is_soloed,
      is_muted: track.is_muted,
      type: track.type,
      color: track.color,
    }))

    createSnapshot({
      name,
      trackStates,
    })
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50">
      <WorkflowTitle
        title="Export Workflow"
        subtitle="Project Info → Snapshot Management → Export Settings"
        rightSlot={
          props.onBackHome ? (
            <button
              onClick={props.onBackHome}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              Back to Home
            </button>
          ) : undefined
        }
      />
      <WorkflowStepper steps={stepNames} currentStep={currentStep} />

      <div className="flex-1 overflow-auto">
        {currentStep === 1 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title="Step 1: Project Information"
                subtitle="View current Pro Tools project connection status and track information."
              >
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                    <div className="text-gray-900">{sessionName || 'Unknown'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sample Rate</label>
                    <div className="text-gray-900">{sampleRate ? `${sampleRate} Hz` : 'Unknown'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bit Depth</label>
                    <div className="text-gray-900">{formatBitDepthLabel(bitDepth)}</div>
                  </div>
                </div>
                <button
                  onClick={refreshTracks}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  disabled={!isConnected}
                >
                  Refresh Info
                </button>
              </WorkflowCard>
              <TrackList tracks={tracks} isConnected={isConnected} />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title="Step 2: Track Snapshot Management"
                subtitle="Create and manage track state snapshots."
              >
                <div className="text-sm text-gray-600">Use the snapshot panel below to create, edit, and remove snapshots.</div>
              </WorkflowCard>
              <SnapshotPanel
                snapshots={snapshots}
                onCreateSnapshot={handleCreateSnapshot}
                onDeleteSnapshot={deleteSnapshot}
                onUpdateSnapshot={updateSnapshot}
                selectedTracksCount={tracks.length}
                onGetStorageInfo={getStorageInfo}
              />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title="Step 3: STEM Export Settings"
                subtitle="Select snapshots to export and configure export parameters."
              />
              {snapshots.length === 0 ? (
                <WorkflowCard>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Export Snapshots</h3>
                  <p className="text-gray-600 mb-4">Please create snapshots in Step 2 first</p>
                </WorkflowCard>
              ) : (
                <ExportPanel snapshots={snapshots} />
              )}
            </div>
          </div>
        )}
      </div>

      <WorkflowActionBar
        leftHint={
          currentStep === 1
            ? isConnected
              ? 'Ready to continue.'
              : 'Connect Pro Tools before continuing.'
            : currentStep === 2
              ? snapshots.length > 0
                ? 'Snapshots ready.'
                : 'Create at least one snapshot.'
              : 'Review settings and start export from the panel above.'
        }
      >
        {currentStep === 2 ? (
          <button
            onClick={() => setCurrentStep(1)}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            Previous: Project Info
          </button>
        ) : null}
        {currentStep === 3 ? (
          <button
            onClick={() => setCurrentStep(2)}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            Previous: Snapshot Management
          </button>
        ) : null}
        {currentStep === 1 ? (
          <button
            onClick={() => setCurrentStep(2)}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            disabled={!isConnected}
          >
            Next: Manage Snapshots
          </button>
        ) : null}
        {currentStep === 2 ? (
          <button
            onClick={() => setCurrentStep(3)}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            disabled={snapshots.length === 0}
          >
            Next: Export Settings
          </button>
        ) : null}
      </WorkflowActionBar>
    </div>
  )
}
