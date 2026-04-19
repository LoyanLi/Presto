import React from './react-shared.mjs'
import { tTimeCalculator } from './i18n.mjs'
import {
  DEFAULT_NOTE_VALUE_ID,
  DEFAULT_PREDELAY_NOTE_ID,
  DEFAULT_REVERB_TAIL_BARS,
  NOTE_VALUE_OPTIONS,
  PREDELAY_NOTE_OPTIONS,
  REVERB_TAIL_BAR_OPTIONS,
  buildDurationRows,
  calculateBpmFromDuration,
  calculateReverbTiming,
  formatMilliseconds,
  getNoteValueById,
  getPredelayNoteValueById,
} from './toolCore.mjs'
import {
  ToolInput,
  ToolPanel,
  ToolSelect,
  ToolStat,
} from './ui.mjs'

const h = React.createElement

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function TimeCalculatorToolPage({ context }) {
  const [bpm, setBpm] = React.useState(120)
  const [beatsPerBar, setBeatsPerBar] = React.useState(4)
  const [durationMs, setDurationMs] = React.useState(500)
  const [bpmNoteId, setBpmNoteId] = React.useState(DEFAULT_NOTE_VALUE_ID)
  const [reverbBars, setReverbBars] = React.useState(DEFAULT_REVERB_TAIL_BARS)
  const [predelayNoteId, setPredelayNoteId] = React.useState(DEFAULT_PREDELAY_NOTE_ID)

  const durationRows = React.useMemo(
    () => buildDurationRows({ bpm, beatsPerBar }),
    [bpm, beatsPerBar],
  )
  const quarterDuration = durationRows.find((row) => row.id === '1/4')?.milliseconds ?? 0
  const dottedEighthDuration = durationRows.find((row) => row.id === '1/8d')?.milliseconds ?? 0
  const barDuration = durationRows.find((row) => row.id === 'bar')?.milliseconds ?? 0
  const twoBarDuration = durationRows.find((row) => row.id === '2bar')?.milliseconds ?? 0
  const derivedBpm = calculateBpmFromDuration({
    milliseconds: durationMs,
    noteValue: getNoteValueById(bpmNoteId),
  })
  const reverbTiming = calculateReverbTiming({
    bpm,
    beatsPerBar,
    tailBars: reverbBars,
    predelayNote: getPredelayNoteValueById(predelayNoteId),
  })

  return h(
    'section',
    { className: 'tc-shell' },
    h(
      'div',
      { className: 'tc-grid' },
      h(
        ToolPanel,
        {
          title: tTimeCalculator(context, 'section.tempo.title'),
          description: tTimeCalculator(context, 'section.tempo.description'),
          className: 'tc-panel',
        },
        h(
          'div',
          { className: 'tc-form-grid' },
          h(ToolInput, {
            label: tTimeCalculator(context, 'field.bpm'),
            type: 'number',
            min: 1,
            value: bpm,
            onChange: (event) => setBpm(toNumber(event.target.value, 120)),
          }),
          h(ToolInput, {
            label: tTimeCalculator(context, 'field.beatsPerBar'),
            type: 'number',
            min: 1,
            value: beatsPerBar,
            onChange: (event) => setBeatsPerBar(toNumber(event.target.value, 4)),
          }),
        ),
        h(
          'div',
          { className: 'tc-stat-grid' },
          h(ToolStat, { label: tTimeCalculator(context, 'summary.quarter'), value: formatMilliseconds(quarterDuration) }),
          h(ToolStat, { label: tTimeCalculator(context, 'summary.eighthDotted'), value: formatMilliseconds(dottedEighthDuration) }),
          h(ToolStat, { label: tTimeCalculator(context, 'summary.bar'), value: formatMilliseconds(barDuration) }),
          h(ToolStat, { label: tTimeCalculator(context, 'summary.twoBars'), value: formatMilliseconds(twoBarDuration) }),
        ),
        h('p', { className: 'tc-section-label' }, tTimeCalculator(context, 'label.commonDurations')),
        h(
          'div',
          { className: 'tc-duration-list' },
          durationRows.map((row) =>
            h(
              'div',
              { key: row.id, className: 'tc-duration-row' },
              h('span', { className: 'tc-duration-row__label' }, row.label),
              h('strong', { className: 'tc-duration-row__value' }, formatMilliseconds(row.milliseconds)),
            ),
          ),
        ),
      ),
      h(
        ToolPanel,
        {
          title: tTimeCalculator(context, 'section.reverse.title'),
          description: tTimeCalculator(context, 'section.reverse.description'),
          className: 'tc-panel',
        },
        h(
          'div',
          { className: 'tc-form-grid' },
          h(ToolInput, {
            label: tTimeCalculator(context, 'field.durationMs'),
            type: 'number',
            min: 1,
            value: durationMs,
            onChange: (event) => setDurationMs(toNumber(event.target.value, 500)),
          }),
          h(ToolSelect, {
            label: tTimeCalculator(context, 'field.noteValue'),
            value: bpmNoteId,
            onChange: (event) => setBpmNoteId(event.target.value || DEFAULT_NOTE_VALUE_ID),
            options: NOTE_VALUE_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            })),
          }),
        ),
        h(
          'div',
          { className: 'tc-stat-grid tc-stat-grid--single' },
          h(ToolStat, {
            label: tTimeCalculator(context, 'summary.derivedBpm'),
            value: roundBpm(derivedBpm),
          }),
        ),
      ),
      h(
        ToolPanel,
        {
          title: tTimeCalculator(context, 'section.reverb.title'),
          description: tTimeCalculator(context, 'section.reverb.description'),
          className: 'tc-panel',
        },
        h(
          'div',
          { className: 'tc-form-grid' },
          h(ToolSelect, {
            label: tTimeCalculator(context, 'field.reverbBars'),
            value: String(reverbBars),
            onChange: (event) => setReverbBars(toNumber(event.target.value, DEFAULT_REVERB_TAIL_BARS)),
            options: REVERB_TAIL_BAR_OPTIONS.map((option) => ({
              value: option.id,
              label:
                option.bars === 0.5
                  ? tTimeCalculator(context, 'option.reverbBars.half')
                  : option.bars === 1
                    ? tTimeCalculator(context, 'option.reverbBars.one')
                    : option.bars === 2
                      ? tTimeCalculator(context, 'option.reverbBars.two')
                      : tTimeCalculator(context, 'option.reverbBars.four'),
            })),
          }),
          h(ToolSelect, {
            label: tTimeCalculator(context, 'field.predelayNote'),
            value: predelayNoteId,
            onChange: (event) => setPredelayNoteId(event.target.value || DEFAULT_PREDELAY_NOTE_ID),
            options: PREDELAY_NOTE_OPTIONS.map((option) => ({
              value: option.id,
              label: option.label,
            })),
          }),
        ),
        h(
          'div',
          { className: 'tc-stat-grid tc-stat-grid--triple' },
          h(ToolStat, { label: tTimeCalculator(context, 'summary.reverbTail'), value: formatMilliseconds(reverbTiming.tailMilliseconds) }),
          h(ToolStat, { label: tTimeCalculator(context, 'summary.predelay'), value: formatMilliseconds(reverbTiming.predelayMilliseconds) }),
          h(ToolStat, {
            label: tTimeCalculator(context, 'label.tailSeconds'),
            value: tTimeCalculator(context, 'label.tailSecondsValue', { value: roundSeconds(reverbTiming.tailSeconds) }),
          }),
        ),
      ),
    ),
  )
}

function roundBpm(value) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function roundSeconds(value) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
