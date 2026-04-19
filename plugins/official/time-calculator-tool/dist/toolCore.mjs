export const DEFAULT_NOTE_VALUE_ID = '1/4'
export const DEFAULT_PREDELAY_NOTE_ID = '1/64'
export const DEFAULT_REVERB_TAIL_BARS = 2

function roundTo(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clampPositiveNumber(value, fallback) {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const NOTE_VALUE_OPTIONS = [
  { id: '1m', label: '1/1', noteValue: 4 },
  { id: '1/2', label: '1/2', noteValue: 2 },
  { id: '1/2d', label: '1/2.', noteValue: 3 },
  { id: '1/2t', label: '1/2T', noteValue: 4 / 3 },
  { id: '1/4', label: '1/4', noteValue: 1 },
  { id: '1/4d', label: '1/4.', noteValue: 1.5 },
  { id: '1/4t', label: '1/4T', noteValue: 2 / 3 },
  { id: '1/8', label: '1/8', noteValue: 0.5 },
  { id: '1/8d', label: '1/8.', noteValue: 0.75 },
  { id: '1/8t', label: '1/8T', noteValue: 1 / 3 },
  { id: '1/16', label: '1/16', noteValue: 0.25 },
  { id: '1/16d', label: '1/16.', noteValue: 0.375 },
  { id: '1/32', label: '1/32', noteValue: 0.125 },
]

export const PREDELAY_NOTE_OPTIONS = [
  { id: '1/64', label: '1/64', noteValue: 0.0625 },
  { id: '1/32', label: '1/32', noteValue: 0.125 },
  { id: '1/16', label: '1/16', noteValue: 0.25 },
  { id: '1/8', label: '1/8', noteValue: 0.5 },
  { id: '1/8d', label: '1/8.', noteValue: 0.75 },
  { id: '1/4', label: '1/4', noteValue: 1 },
]

export const REVERB_TAIL_BAR_OPTIONS = [
  { id: '0.5', bars: 0.5 },
  { id: '1', bars: 1 },
  { id: '2', bars: 2 },
  { id: '4', bars: 4 },
]

function findNoteOption(options, id, fallbackId) {
  return options.find((option) => option.id === id) ?? options.find((option) => option.id === fallbackId) ?? options[0]
}

export function normalizeCalculatorState(input = {}) {
  return {
    bpm: clampPositiveNumber(input.bpm, 120),
    beatsPerBar: clampPositiveNumber(input.beatsPerBar, 4),
    durationMs: clampPositiveNumber(input.durationMs, 500),
    bpmNoteId: findNoteOption(NOTE_VALUE_OPTIONS, String(input.bpmNoteId ?? ''), DEFAULT_NOTE_VALUE_ID).id,
    reverbBars: REVERB_TAIL_BAR_OPTIONS.find((option) => option.id === String(input.reverbBars ?? '').trim())?.bars ?? DEFAULT_REVERB_TAIL_BARS,
    predelayNoteId: findNoteOption(PREDELAY_NOTE_OPTIONS, String(input.predelayNoteId ?? ''), DEFAULT_PREDELAY_NOTE_ID).id,
  }
}

export function calculateNoteDurationMs(bpm, noteValue) {
  return (60000 / bpm) * noteValue
}

export function calculateBpmFromDuration({ milliseconds, noteValue }) {
  return (60000 * noteValue) / milliseconds
}

export function calculateReverbTiming({ bpm, beatsPerBar, tailBars, predelayNote }) {
  const quarterNoteMs = calculateNoteDurationMs(bpm, 1)
  const tailMilliseconds = quarterNoteMs * beatsPerBar * tailBars

  return {
    tailMilliseconds,
    tailSeconds: tailMilliseconds / 1000,
    predelayMilliseconds: calculateNoteDurationMs(bpm, predelayNote),
  }
}

export function formatMilliseconds(value) {
  const rounded = roundTo(value)
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded} ms`
}

export function buildDurationRows({ bpm, beatsPerBar }) {
  const noteRows = [
    { id: '1m', label: '1/1', milliseconds: calculateNoteDurationMs(bpm, 4) },
    { id: '1/2', label: '1/2', milliseconds: calculateNoteDurationMs(bpm, 2) },
    { id: '1/4', label: '1/4', milliseconds: calculateNoteDurationMs(bpm, 1) },
    { id: '1/8', label: '1/8', milliseconds: calculateNoteDurationMs(bpm, 0.5) },
    { id: '1/8d', label: '1/8.', milliseconds: calculateNoteDurationMs(bpm, 0.75) },
    { id: '1/4t', label: '1/4T', milliseconds: calculateNoteDurationMs(bpm, 2 / 3) },
    { id: '1/16', label: '1/16', milliseconds: calculateNoteDurationMs(bpm, 0.25) },
  ]
  const barMilliseconds = calculateNoteDurationMs(bpm, 1) * beatsPerBar

  return [
    ...noteRows,
    { id: 'bar', label: '1 Bar', milliseconds: barMilliseconds },
    { id: '2bar', label: '2 Bars', milliseconds: barMilliseconds * 2 },
  ]
}

export function getNoteValueById(id) {
  return findNoteOption(NOTE_VALUE_OPTIONS, id, DEFAULT_NOTE_VALUE_ID).noteValue
}

export function getPredelayNoteValueById(id) {
  return findNoteOption(PREDELAY_NOTE_OPTIONS, id, DEFAULT_PREDELAY_NOTE_ID).noteValue
}
