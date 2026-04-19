import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_NOTE_VALUE_ID,
  DEFAULT_PREDELAY_NOTE_ID,
  DEFAULT_REVERB_TAIL_BARS,
  NOTE_VALUE_OPTIONS,
  PREDELAY_NOTE_OPTIONS,
  buildDurationRows,
  calculateBpmFromDuration,
  calculateNoteDurationMs,
  calculateReverbTiming,
  formatMilliseconds,
  normalizeCalculatorState,
} from '../dist/toolCore.mjs'

test('normalizeCalculatorState trims values and falls back to defaults for invalid fields', () => {
  const normalized = normalizeCalculatorState({
    bpm: ' 0 ',
    beatsPerBar: ' x ',
    durationMs: '  250 ',
    bpmNoteId: 'unknown',
    reverbBars: '  ',
    predelayNoteId: 'invalid',
  })

  assert.equal(normalized.bpm, 120)
  assert.equal(normalized.beatsPerBar, 4)
  assert.equal(normalized.durationMs, 250)
  assert.equal(normalized.bpmNoteId, DEFAULT_NOTE_VALUE_ID)
  assert.equal(normalized.reverbBars, DEFAULT_REVERB_TAIL_BARS)
  assert.equal(normalized.predelayNoteId, DEFAULT_PREDELAY_NOTE_ID)
})

test('calculateNoteDurationMs converts bpm and note values into milliseconds', () => {
  assert.equal(calculateNoteDurationMs(120, 1), 500)
  assert.equal(calculateNoteDurationMs(120, 0.5), 250)
  assert.equal(calculateNoteDurationMs(120, 1.5), 750)
  assert.equal(calculateNoteDurationMs(90, 4), 2666.6666666666665)
})

test('buildDurationRows returns common musical durations including bars', () => {
  const rows = buildDurationRows({ bpm: 120, beatsPerBar: 4 })

  assert.equal(rows[0]?.id, '1m')
  assert.equal(rows[0]?.milliseconds, 2000)
  assert.equal(rows.find((row) => row.id === '1/8d')?.milliseconds, 375)
  assert.equal(rows.find((row) => row.id === 'bar')?.milliseconds, 2000)
  assert.equal(rows.find((row) => row.id === '2bar')?.milliseconds, 4000)
})

test('calculateBpmFromDuration resolves bpm from duration and note value', () => {
  assert.equal(calculateBpmFromDuration({ milliseconds: 500, noteValue: 1 }), 120)
  assert.equal(calculateBpmFromDuration({ milliseconds: 250, noteValue: 0.5 }), 120)
  assert.equal(Number(calculateBpmFromDuration({ milliseconds: 333.3333333333, noteValue: 0.6666666667 }).toFixed(2)), 120)
})

test('calculateReverbTiming derives tail and predelay values from tempo', () => {
  const timing = calculateReverbTiming({
    bpm: 120,
    beatsPerBar: 4,
    tailBars: 2,
    predelayNote: 0.125,
  })

  assert.equal(timing.tailMilliseconds, 4000)
  assert.equal(timing.tailSeconds, 4)
  assert.equal(timing.predelayMilliseconds, 62.5)
})

test('formatMilliseconds keeps compact readable values for ui cards', () => {
  assert.equal(formatMilliseconds(500), '500 ms')
  assert.equal(formatMilliseconds(62.5), '62.5 ms')
  assert.equal(formatMilliseconds(2666.6666), '2666.67 ms')
})

test('time calculator exposes note and predelay presets needed by the ui', () => {
  assert.equal(Array.isArray(NOTE_VALUE_OPTIONS), true)
  assert.equal(Array.isArray(PREDELAY_NOTE_OPTIONS), true)
  assert.equal(NOTE_VALUE_OPTIONS.some((option) => option.id === '1/4'), true)
  assert.equal(NOTE_VALUE_OPTIONS.some((option) => option.id === '1/8d'), true)
  assert.equal(PREDELAY_NOTE_OPTIONS.some((option) => option.id === '1/64'), true)
})
