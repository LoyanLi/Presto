import test from 'node:test'
import assert from 'node:assert/strict'

import { computeNextRowSelection } from './rowSelection'

test('single click selects only clicked row', () => {
  const result = computeNextRowSelection({
    orderedPaths: ['/a', '/b', '/c'],
    prevSelected: new Set(['/a', '/b']),
    prevAnchor: '/a',
    clickedPath: '/c',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
  })

  assert.deepEqual(Array.from(result.selected), ['/c'])
  assert.equal(result.anchor, '/c')
})

test('single click on already selected row clears selection', () => {
  const result = computeNextRowSelection({
    orderedPaths: ['/a', '/b', '/c'],
    prevSelected: new Set(['/b']),
    prevAnchor: '/b',
    clickedPath: '/b',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
  })

  assert.equal(result.selected.size, 0)
  assert.equal(result.anchor, null)
})

test('cmd click toggles selection', () => {
  const result = computeNextRowSelection({
    orderedPaths: ['/a', '/b', '/c'],
    prevSelected: new Set(['/a']),
    prevAnchor: '/a',
    clickedPath: '/c',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
  })

  assert.deepEqual(new Set(result.selected), new Set(['/a', '/c']))
  assert.equal(result.anchor, '/c')
})

test('shift click selects contiguous range from anchor', () => {
  const result = computeNextRowSelection({
    orderedPaths: ['/a', '/b', '/c', '/d'],
    prevSelected: new Set(['/b']),
    prevAnchor: '/b',
    clickedPath: '/d',
    metaKey: false,
    ctrlKey: false,
    shiftKey: true,
  })

  assert.deepEqual(Array.from(result.selected), ['/b', '/c', '/d'])
  assert.equal(result.anchor, '/b')
})

test('cmd+shift click appends contiguous range', () => {
  const result = computeNextRowSelection({
    orderedPaths: ['/a', '/b', '/c', '/d'],
    prevSelected: new Set(['/a']),
    prevAnchor: '/b',
    clickedPath: '/d',
    metaKey: true,
    ctrlKey: false,
    shiftKey: true,
  })

  assert.deepEqual(new Set(result.selected), new Set(['/a', '/b', '/c', '/d']))
  assert.equal(result.anchor, '/b')
})
