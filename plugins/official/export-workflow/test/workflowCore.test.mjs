import test from 'node:test'
import assert from 'node:assert/strict'

import * as workflowCore from '../dist/workflowCore.mjs'
import {
  buildExportRunPayload,
  createDefaultExportSettings,
  createDefaultExportWorkflowSettings,
  createSnapshotFromTracks,
  deriveExportJobView,
  getSnapshotStorageKey,
  loadExportWorkflowSettings,
  saveExportWorkflowSettings,
  mergeExportWorkflowSettings,
  normalizePreset,
  summarizeSnapshot,
  validatePresetName,
  validateSnapshotName,
} from '../dist/workflowCore.mjs'

test('createDefaultExportSettings uses the current session name as the prefix seed', () => {
  const settings = createDefaultExportSettings({
    sessionName: 'Album Mix.ptx',
  })

  assert.equal(settings.file_prefix, 'Album Mix_')
  assert.equal(settings.file_format, 'wav')
  assert.deepEqual(settings.mix_sources, [])
})

test('createSnapshotFromTracks stores the old snapshot track-state semantics', () => {
  const snapshot = createSnapshotFromTracks('Verse A', [
    { id: 'track-1', name: 'Kick', is_muted: true, is_soloed: false, type: 'audio', color: '#111111' },
    { id: 'track-2', name: 'Bass', is_muted: false, is_soloed: true, type: 'audio', color: '#222222' },
  ])

  assert.equal(snapshot.name, 'Verse A')
  assert.equal(snapshot.trackStates[0]?.is_muted, true)
  assert.equal(snapshot.trackStates[1]?.is_soloed, true)
  assert.deepEqual(summarizeSnapshot(snapshot), {
    totalTracks: 2,
    mutedTracks: 1,
    soloedTracks: 1,
  })
})

test('buildExportRunPayload emits exportSettings with snake_case track flags preserved', () => {
  const payload = buildExportRunPayload({
    snapshots: [
      {
        id: 'snapshot-1',
        name: 'Verse',
        createdAt: '2026-03-25T00:00:00Z',
        updatedAt: '2026-03-25T00:00:00Z',
        trackStates: [
          {
            trackId: 'track-1',
            trackName: 'Kick',
            is_muted: true,
            is_soloed: false,
            type: 'audio',
          },
        ],
      },
    ],
    settings: {
      file_format: 'wav',
      mix_source_name: 'Out 1-2',
      mix_source_type: 'PhysicalOut',
      online_export: false,
      file_prefix: 'Mix_',
      output_path: '/Users/test/Exports',
    },
  })

  assert.equal(payload.exportSettings.file_format, 'wav')
  assert.equal(payload.exportSettings.mix_source_type, 'PhysicalOut')
  assert.equal(payload.startTime, null)
  assert.equal(payload.endTime, null)
  assert.equal(payload.snapshots[0]?.trackStates[0]?.is_muted, true)
  assert.equal(payload.snapshots[0]?.trackStates[0]?.is_soloed, false)
  assert.equal('export_settings' in payload, false)
})

test('deriveExportJobView maps backend job metadata and completed_with_errors result', () => {
  const view = deriveExportJobView({
    jobId: 'export-123',
    state: 'succeeded',
    progress: {
      percent: 100,
      current: 2,
      total: 2,
      message: 'Export workflow completed with errors.',
    },
    metadata: {
      currentSnapshot: 2,
      currentSnapshotName: 'Bridge',
      totalSnapshots: 2,
      etaSeconds: 0,
      exportedCount: 1,
      lastExportedFile: '/Users/test/Exports/Mix_Verse.wav',
      currentMixSourceName: 'Ref Print (Stereo)',
      currentMixSourceIndex: 2,
      totalMixSources: 3,
      currentFileProgressPercent: 47,
      overallProgressPercent: 73.5,
    },
    result: {
      status: 'completed_with_errors',
      success: false,
      exportedFiles: ['/Users/test/Exports/Mix_Verse.wav'],
      failedSnapshots: ['Bridge'],
      failedSnapshotDetails: [{ snapshotName: 'Bridge', error: 'Export file missing for Bridge.' }],
      totalDuration: 12.2,
      errorMessage: 'Partial export failures: Bridge',
    },
  })

  assert.equal(view.terminalStatus, 'completed_with_errors')
  assert.equal(view.currentSnapshot, 2)
  assert.equal(view.totalSnapshots, 2)
  assert.equal(view.currentMixSourceName, 'Ref Print (Stereo)')
  assert.equal(view.currentMixSourceIndex, 2)
  assert.equal(view.totalMixSources, 3)
  assert.equal(view.currentFileProgressPercent, 47)
  assert.equal(view.overallProgressPercent, 73.5)
  assert.equal(view.exportedCount, 1)
  assert.equal(view.failedSnapshots[0], 'Bridge')
  assert.deepEqual(view.failedSnapshotDetails, [{ snapshotName: 'Bridge', error: 'Export file missing for Bridge.' }])
  assert.equal(view.isTerminal, true)
})

test('storage helpers and name validators keep snapshot persistence deterministic', () => {
  const snapshotStorageKey = getSnapshotStorageKey({
    sessionPath: '/Users/test/Documents/Album/Album.ptx',
  })
  const preset = normalizePreset({ name: 'TV Mix', file_format: 'wav', mix_source_name: 'Out 1-2' })

  assert.equal(snapshotStorageKey, 'sessionSnapshots:/Users/test/Documents/Album/Album.ptx')
  assert.equal(validateSnapshotName('Verse', [{ id: 'a', name: 'Verse', trackStates: [] }]), 'Snapshot name "Verse" already exists.')
  assert.equal(validatePresetName('TV Mix', [preset]), 'Preset name "TV Mix" already exists.')
})

test('export workflow plugin settings default to selecting all snapshots in step 3', () => {
  const settings = createDefaultExportWorkflowSettings()

  assert.deepEqual(settings, {
    defaultSnapshotSelection: 'all',
  })
  assert.equal(mergeExportWorkflowSettings({ defaultSnapshotSelection: 'none' }).defaultSnapshotSelection, 'none')
  assert.equal(mergeExportWorkflowSettings({ defaultSnapshotSelection: 'invalid' }).defaultSnapshotSelection, 'all')
})

test('export workflow plugin settings load and save through plugin-local storage', async () => {
  const calls = []
  const storage = {
    async get(key) {
      calls.push(['get', key])
      return { defaultSnapshotSelection: 'none' }
    },
    async set(key, value) {
      calls.push(['set', key, value])
    },
  }

  const loaded = await loadExportWorkflowSettings(storage)
  const saved = await saveExportWorkflowSettings(storage, { defaultSnapshotSelection: 'none' })

  assert.equal(loaded.defaultSnapshotSelection, 'none')
  assert.equal(saved.defaultSnapshotSelection, 'none')
  assert.deepEqual(calls, [
    ['get', 'settings.v1'],
    ['set', 'settings.v1', { defaultSnapshotSelection: 'none' }],
  ])
})

test('workflow core does not expose runtime-fs persistence helpers', () => {
  assert.equal('loadSnapshotsFromSession' in workflowCore, false)
  assert.equal('saveSnapshotsToSession' in workflowCore, false)
  assert.equal('getSnapshotStorageInfo' in workflowCore, false)
  assert.equal('loadPresets' in workflowCore, false)
  assert.equal('savePresets' in workflowCore, false)
  assert.equal('getPresetStorageInfo' in workflowCore, false)
})
