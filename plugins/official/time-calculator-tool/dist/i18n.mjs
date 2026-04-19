const messages = {
  en: {
    'manifest.displayName': 'Time Calculator',
    'manifest.description': 'Convert BPM, milliseconds, note values, and tempo-synced reverb timings in one tool page.',
    'page.title': 'Time Calculator',
    'page.subtitle': 'Tempo-synced timing for delay, groove, pre-delay, and reverb decisions.',
    'section.tempo.title': 'BPM to Time',
    'section.tempo.description': 'Read the most common musical divisions as milliseconds and seconds.',
    'section.reverse.title': 'Time to BPM',
    'section.reverse.description': 'Reverse a measured delay or gap back into BPM using a note value.',
    'section.reverb.title': 'Reverb / Pre-delay',
    'section.reverb.description': 'Dial in tempo-locked reverb tails and pre-delay values from the same session tempo.',
    'field.bpm': 'BPM',
    'field.beatsPerBar': 'Beats per bar',
    'field.durationMs': 'Duration (ms)',
    'field.noteValue': 'Note value',
    'field.reverbBars': 'Tail length',
    'field.predelayNote': 'Pre-delay note',
    'summary.quarter': 'Quarter',
    'summary.eighthDotted': 'Dotted 1/8',
    'summary.bar': '1 Bar',
    'summary.twoBars': '2 Bars',
    'summary.derivedBpm': 'Derived BPM',
    'summary.reverbTail': 'Tail',
    'summary.predelay': 'Pre-delay',
    'label.tailSeconds': 'Tail Seconds',
    'label.commonDurations': 'Common durations',
    'label.tailSecondsValue': '{value} s',
    'option.reverbBars.half': '1/2 Bar',
    'option.reverbBars.one': '1 Bar',
    'option.reverbBars.two': '2 Bars',
    'option.reverbBars.four': '4 Bars',
  },
  'zh-CN': {
    'manifest.displayName': '时间计算器',
    'manifest.description': '在一个工具页里完成 BPM、毫秒、音符时值和节奏同步混响时间换算。',
    'page.title': '时间计算器',
    'page.subtitle': '用于 delay、律动、预延迟和混响尾音的节奏同步时间换算。',
    'section.tempo.title': 'BPM 转时间',
    'section.tempo.description': '把常见音乐时值直接换算成毫秒和秒。',
    'section.reverse.title': '时间反推 BPM',
    'section.reverse.description': '把测得的 delay 或时间间隔按音符时值反推出 BPM。',
    'section.reverb.title': '混响 / 预延迟',
    'section.reverb.description': '用同一个工程速度直接算出节奏同步的混响尾音和预延迟。',
    'field.bpm': 'BPM',
    'field.beatsPerBar': '每小节拍数',
    'field.durationMs': '时长（ms）',
    'field.noteValue': '音符时值',
    'field.reverbBars': '尾音长度',
    'field.predelayNote': '预延迟音符',
    'summary.quarter': '四分音符',
    'summary.eighthDotted': '附点八分',
    'summary.bar': '1 小节',
    'summary.twoBars': '2 小节',
    'summary.derivedBpm': '反推 BPM',
    'summary.reverbTail': '尾音',
    'summary.predelay': '预延迟',
    'label.tailSeconds': '尾音秒数',
    'label.commonDurations': '常用时值',
    'label.tailSecondsValue': '{value} 秒',
    'option.reverbBars.half': '1/2 小节',
    'option.reverbBars.one': '1 小节',
    'option.reverbBars.two': '2 小节',
    'option.reverbBars.four': '4 小节',
  },
}

export function resolveTimeCalculatorLocale(input) {
  const candidates = [input?.resolved, input?.requested, input?.locale?.resolved, input?.locale?.requested, input?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
    ? 'zh-CN'
    : 'en'
}

export function tTimeCalculator(input, key, replacements = {}) {
  const locale = resolveTimeCalculatorLocale(input)
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value)),
    messages[locale][key] ?? messages.en[key] ?? key,
  )
}
