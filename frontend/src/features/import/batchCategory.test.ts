import test from 'node:test'
import assert from 'node:assert/strict'

import { applyCategoryToPaths } from './batchCategory'

test('applyCategoryToPaths updates selected rows only', () => {
  const files = [
    { file_path: '/a.wav', category_id: 'drums' },
    { file_path: '/b.wav', category_id: 'bass' },
    { file_path: '/c.wav', category_id: 'fx' },
  ]
  const proposals = [
    { file_path: '/a.wav', category_id: 'drums', final_name: 'Kick' },
    { file_path: '/b.wav', category_id: 'bass', final_name: 'Bass' },
  ]

  const result = applyCategoryToPaths(files, proposals, ['/a.wav', '/c.wav'], 'vocal')

  assert.equal(result.changed, true)
  assert.equal(result.files[0].category_id, 'vocal')
  assert.equal(result.files[1].category_id, 'bass')
  assert.equal(result.files[2].category_id, 'vocal')
  assert.equal(result.proposals[0].category_id, 'vocal')
  assert.equal(result.proposals[1].category_id, 'bass')
})

test('applyCategoryToPaths does nothing when no selection', () => {
  const files = [{ file_path: '/a.wav', category_id: 'drums' }]
  const proposals = [{ file_path: '/a.wav', category_id: 'drums', final_name: 'Kick' }]

  const result = applyCategoryToPaths(files, proposals, [], 'vocal')

  assert.equal(result.changed, false)
  assert.deepEqual(result.files, files)
  assert.deepEqual(result.proposals, proposals)
})
