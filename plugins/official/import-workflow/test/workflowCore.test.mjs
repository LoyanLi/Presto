import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPatchToSelectedRows,
  analyzeFilePaths,
  buildAnalyzeCachePayload,
  buildRunValidation,
  categoryEditorReducer,
  finalizeRowsForImport,
  parseAiResponseContent,
  planPostImportActions,
  runAiAnalyzeInPlugin,
} from '../dist/workflowCore.mjs'

test('analyzeFilePaths builds ready proposals with normalized stems', () => {
  const proposals = analyzeFilePaths(
    ['/Volumes/SFX/Kick_In.wav', '/Volumes/SFX/Lead Vox.aiff'],
    [{ id: 'drums', name: 'Drums', colorSlot: 4, previewHex: '#ffcc00' }],
    ['drums'],
  )

  assert.equal(proposals.length, 2)
  assert.equal(proposals[0]?.aiName, 'Kick In')
  assert.equal(proposals[0]?.finalName, 'Kick In')
  assert.equal(proposals[0]?.status, 'ready')
  assert.equal(proposals[1]?.aiName, 'Lead Vox')
})

test('buildRunValidation reports duplicate and empty final names', () => {
  const issues = buildRunValidation([
    {
      filePath: '/tmp/A.wav',
      categoryId: 'drums',
      aiName: 'A',
      finalName: '',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/tmp/B.wav',
      categoryId: 'drums',
      aiName: 'B',
      finalName: 'Shared',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/tmp/C.wav',
      categoryId: 'drums',
      aiName: 'C',
      finalName: 'shared',
      status: 'ready',
      errorMessage: null,
    },
  ])

  assert.deepEqual(issues.sort(), ['duplicate_final_name:shared', 'empty_final_name:/tmp/A.wav'])
})

test('planPostImportActions maps imported tracks to rename/color/strip actions', () => {
  const actionPlan = planPostImportActions({
    proposals: [
      {
        filePath: '/tmp/A.wav',
        categoryId: 'drums',
        aiName: 'A',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
      },
      {
        filePath: '/tmp/B.wav',
        categoryId: 'vox',
        aiName: 'B',
        finalName: 'Lead Vox',
        status: 'ready',
        errorMessage: null,
      },
    ],
    importedTrackNames: ['Audio 1', 'Audio 2'],
    categoryColorSlotById: {
      drums: 3,
      vox: 6,
    },
    stripAfterImport: true,
  })

  assert.deepEqual(actionPlan.renameActions, [
    { currentName: 'Audio 1', newName: 'Kick In' },
    { currentName: 'Audio 2', newName: 'Lead Vox' },
  ])
  assert.deepEqual(actionPlan.colorActions, [
    { trackName: 'Kick In', colorSlot: 3 },
    { trackName: 'Lead Vox', colorSlot: 6 },
  ])
  assert.deepEqual(actionPlan.stripActions, [{ trackName: 'Kick In' }, { trackName: 'Lead Vox' }])
})

test('finalizeRowsForImport preserves incoming ready-row order while uniquifying names', () => {
  const finalized = finalizeRowsForImport({
    rows: [
      {
        filePath: '/tmp/Z Vox.wav',
        categoryId: 'vox',
        aiName: 'Lead Vox',
        finalName: 'Lead Vox',
        status: 'ready',
        errorMessage: null,
      },
      {
        filePath: '/tmp/A Kick.wav',
        categoryId: 'drums',
        aiName: 'Kick In',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
      },
    ],
    categories: [
      { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
      { id: 'vox', name: 'Vox', colorSlot: 6, previewHex: '#222222' },
    ],
    existingTrackNames: [],
  })

  assert.deepEqual(
    finalized.executionRows.map((row) => row.filePath),
    ['/tmp/Z Vox.wav', '/tmp/A Kick.wav'],
  )
  assert.deepEqual(
    finalized.executionRows.map((row) => row.finalName),
    ['Lead_Vox', 'Kick_In'],
  )
})

test('applyPatchToSelectedRows supports batch category and name edits', () => {
  const next = applyPatchToSelectedRows({
    rows: [
      {
        filePath: '/tmp/Kick.wav',
        categoryId: 'drums',
        aiName: 'Kick',
        finalName: 'Kick',
        status: 'ready',
        errorMessage: null,
      },
      {
        filePath: '/tmp/Snare.wav',
        categoryId: 'drums',
        aiName: 'Snare',
        finalName: 'Snare',
        status: 'ready',
        errorMessage: null,
      },
    ],
    selectedPaths: new Set(['/tmp/Kick.wav', '/tmp/Snare.wav']),
    patch: {
      categoryId: 'fx',
      finalNameMode: 'prefix',
      finalNameValue: 'A_',
    },
  })

  assert.equal(next[0]?.categoryId, 'fx')
  assert.equal(next[1]?.categoryId, 'fx')
  assert.equal(next[0]?.finalName, 'A_Kick')
  assert.equal(next[1]?.finalName, 'A_Snare')
})

test('buildAnalyzeCachePayload stores relative path per folder row', () => {
  const payload = buildAnalyzeCachePayload({
    folder: '/library/Drums',
    rows: [
      {
        filePath: '/library/Drums/Kick.wav',
        categoryId: 'drums',
        aiName: 'Kick',
        finalName: 'Kick',
        status: 'ready',
        errorMessage: null,
      },
      {
        filePath: '/library/Bass/Bass.wav',
        categoryId: 'bass',
        aiName: 'Bass',
        finalName: 'Bass',
        status: 'ready',
        errorMessage: null,
      },
    ],
  })

  assert.equal(payload.folder, '/library/Drums')
  assert.equal(payload.total, 1)
  assert.equal(payload.proposals[0]?.relative_path, 'Kick.wav')
})

test('categoryEditorReducer supports add/update/remove/move actions', () => {
  const initial = [
    { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
    { id: 'bass', name: 'Bass', colorSlot: 9, previewHex: '#222222' },
  ]
  const added = categoryEditorReducer(initial, { type: 'add' })
  assert.equal(added.length, 3)
  assert.match(added[2].id, /^category_\d+$/)

  const updated = categoryEditorReducer(added, {
    type: 'update',
    id: added[2].id,
    patch: { name: 'FX', colorSlot: 33 },
  })
  assert.equal(updated[2].name, 'FX')
  assert.equal(updated[2].colorSlot, 33)

  const moved = categoryEditorReducer(updated, { type: 'move', id: 'bass', direction: 'up' })
  assert.equal(moved[0].id, 'bass')

  const removed = categoryEditorReducer(moved, { type: 'remove', id: 'drums' })
  assert.equal(removed.some((item) => item.id === 'drums'), false)
})

test('parseAiResponseContent accepts strict json object and text blocks', () => {
  const raw = JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            items: [{ id: '0', normalized_name: 'Lead_Vox', category_id: 'lead_vox' }],
          }),
        },
      },
    ],
  })
  const parsed = parseAiResponseContent(raw, {
    expectedIds: new Set(['0']),
    allowedCategoryIds: new Set(['lead_vox']),
  })
  assert.deepEqual(parsed, [{ id: '0', normalizedName: 'Lead_Vox', categoryId: 'lead_vox' }])
})

test('runAiAnalyzeInPlugin applies vocal override and keeps fallback on failed fetch', async () => {
  const rows = [
    {
      filePath: '/tmp/main vox.wav',
      categoryId: 'other',
      aiName: 'main vox',
      finalName: 'main vox',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/tmp/fx riser.wav',
      categoryId: 'fx',
      aiName: 'fx riser',
      finalName: 'fx riser',
      status: 'ready',
      errorMessage: null,
    },
  ]
  const categories = [
    { id: 'lead_vox', name: 'Lead Vox', colorSlot: 23, previewHex: '#3573DE' },
    { id: 'bgv', name: 'BGV', colorSlot: 28, previewHex: '#631D9F' },
    { id: 'fx', name: 'FX', colorSlot: 33, previewHex: '#9F1D1D' },
    { id: 'other', name: 'Other', colorSlot: 38, previewHex: '#7D9F1D' },
  ]

  const successful = await runAiAnalyzeInPlugin({
    rows,
    categories,
    aiConfig: {
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      timeoutSeconds: 30,
      apiKey: 'test-key',
    },
    fetchImpl: async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    { id: '0', normalized_name: 'Main Vocal', category_id: 'other' },
                    { id: '1', normalized_name: 'FX Riser', category_id: 'fx' },
                  ],
                }),
              },
            },
          ],
        }),
    }),
  })

  assert.equal(successful.rows[0]?.categoryId, 'lead_vox')
  assert.equal(successful.rows[0]?.finalName, 'Main_Vocal')
  assert.equal(successful.rows[1]?.categoryId, 'fx')

  const failed = await runAiAnalyzeInPlugin({
    rows,
    categories,
    aiConfig: {
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      timeoutSeconds: 30,
      apiKey: 'test-key',
    },
    fetchImpl: async () => {
      throw new Error('network down')
    },
  })
  assert.equal(failed.rows[0]?.status, 'failed')
  assert.equal(failed.rows[1]?.status, 'failed')
  assert.match(failed.errorMessage || '', /network down/)
})
