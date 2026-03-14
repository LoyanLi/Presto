import { estimateEtaFromProgress, estimateProgressFromEta, formatEtaLabel, shouldShowExportEta, smoothProgress } from '../src/utils/progressEta'

if (formatEtaLabel(null) !== '--') {
  throw new Error('formatEtaLabel null should return placeholder')
}

if (smoothProgress(40, 30) !== 40) {
  throw new Error('smoothProgress must be monotonic')
}

const startedAt = new Date(Date.now() - 10_000).toISOString()
const eta = estimateEtaFromProgress(startedAt, 50)
if (eta == null || eta <= 0) {
  throw new Error('estimateEtaFromProgress should produce positive eta for running task')
}

if (shouldShowExportEta('running', 1) !== false) {
  throw new Error('shouldShowExportEta must hide eta on first snapshot')
}

if (shouldShowExportEta('running', 2) !== true) {
  throw new Error('shouldShowExportEta should show eta after first snapshot')
}

const projected = estimateProgressFromEta(40, 30, 15_000, 'running')
if (projected <= 40 || projected >= 100) {
  throw new Error('estimateProgressFromEta should increase smoothly without reaching 100 early')
}

const projectedNoEta = estimateProgressFromEta(40, null, 15_000, 'running')
if (projectedNoEta !== 40) {
  throw new Error('estimateProgressFromEta should keep base progress when eta is missing')
}

console.log('progressEta checks passed')
