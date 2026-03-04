import assert from 'node:assert/strict'
import test from 'node:test'

import { formatBitDepthLabel } from './bitDepth'

test('returns unknown when bit depth is undefined', () => {
  assert.equal(formatBitDepthLabel(undefined), 'Unknown')
})

test('formats standard integer bit depths', () => {
  assert.equal(formatBitDepthLabel(24), '24-bit')
  assert.equal(formatBitDepthLabel(16), '16-bit')
})

test('formats 32 as float bit depth', () => {
  assert.equal(formatBitDepthLabel(32), '32-bit float')
})
