import { useState } from 'react'

import { useI18n } from '../../i18n'
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
  const { t } = useI18n()
  const { isConnected, sessionName, sampleRate, bitDepth, tracks, refreshTracks } = useProToolsConnection()
  const { snapshots, createSnapshot, deleteSnapshot, updateSnapshot, getStorageInfo } = useSnapshots()

  const [currentStep, setCurrentStep] = useState(1)
  const stepNames = [t('export.steps.projectInfo'), t('export.steps.snapshotManagement'), t('export.steps.exportSettings')]

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
        title={t('export.title')}
        subtitle={t('export.subtitle')}
        rightSlot={
          props.onBackHome ? (
            <button
              onClick={props.onBackHome}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('export.backHome')}
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
                title={t('export.step1.title')}
                subtitle={t('export.step1.subtitle')}
              >
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('export.step1.projectName')}</label>
                    <div className="text-gray-900">{sessionName || t('export.unknown')}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('export.step1.sampleRate')}</label>
                    <div className="text-gray-900">{sampleRate ? `${sampleRate} Hz` : t('export.unknown')}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('export.step1.bitDepth')}</label>
                    <div className="text-gray-900">{formatBitDepthLabel(bitDepth)}</div>
                  </div>
                </div>
                <button
                  onClick={refreshTracks}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  disabled={!isConnected}
                >
                  {t('export.step1.refreshInfo')}
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
                title={t('export.step2.title')}
                subtitle={t('export.step2.subtitle')}
              >
                <div className="text-sm text-gray-600">{t('export.step2.hint')}</div>
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
                title={t('export.step3.title')}
                subtitle={t('export.step3.subtitle')}
              />
              {snapshots.length === 0 ? (
                <WorkflowCard>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('export.step3.noSnapshotsTitle')}</h3>
                  <p className="text-gray-600 mb-4">{t('export.step3.noSnapshotsHint')}</p>
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
              ? t('export.leftHint.ready')
              : t('export.leftHint.connectBefore')
            : currentStep === 2
              ? snapshots.length > 0
                ? t('export.leftHint.snapshotsReady')
                : t('export.leftHint.createSnapshot')
              : t('export.leftHint.reviewAndStart')
        }
      >
        {currentStep === 2 ? (
          <button
            onClick={() => setCurrentStep(1)}
          className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
            {t('export.nav.prevProjectInfo')}
          </button>
        ) : null}
        {currentStep === 3 ? (
          <button
            onClick={() => setCurrentStep(2)}
          className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
            {t('export.nav.prevSnapshotManagement')}
          </button>
        ) : null}
        {currentStep === 1 ? (
          <button
            onClick={() => setCurrentStep(2)}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            disabled={!isConnected}
          >
            {t('export.nav.nextManageSnapshots')}
          </button>
        ) : null}
        {currentStep === 2 ? (
          <button
            onClick={() => setCurrentStep(3)}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            disabled={snapshots.length === 0}
          >
            {t('export.nav.nextExportSettings')}
          </button>
        ) : null}
      </WorkflowActionBar>
    </div>
  )
}
