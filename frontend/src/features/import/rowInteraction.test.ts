import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldPreventRowMouseDown } from './rowInteraction'

test('prevent default on non-interactive target', () => {
  const target = {
    closest: () => null,
  }
  assert.equal(shouldPreventRowMouseDown(target), true)
})

test('do not prevent default on interactive target', () => {
  const target = {
    closest: () => ({ tagName: 'INPUT' }),
  }
  assert.equal(shouldPreventRowMouseDown(target), false)
})
