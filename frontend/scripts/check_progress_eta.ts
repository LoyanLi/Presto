import { estimateEtaFromProgress, formatEtaLabel, smoothProgress } from '../src/utils/progressEta'

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

console.log('progressEta checks passed')
