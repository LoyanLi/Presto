import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ATMOS_MUX_RESOURCE_ID,
  ATMOS_VIDEO_MUX_TOOL_ID,
  buildAtmosMuxToolRunRequest,
  buildAtmosMuxRunPreview,
  buildAtmosMuxScriptArgs,
  inferParentDirectory,
  normalizeAtmosMuxInput,
  parseAtmosMuxOutputPath,
} from '../dist/toolCore.mjs'

test('normalizeAtmosMuxInput trims values and infers output directory from video path', () => {
  const normalized = normalizeAtmosMuxInput({
    videoPath: '  /tmp/source/video.mp4  ',
    atmosPath: ' /tmp/source/atmos.mp4 ',
    outputDir: '  ',
    allowFpsConversion: true,
  })

  assert.equal(normalized.videoPath, '/tmp/source/video.mp4')
  assert.equal(normalized.atmosPath, '/tmp/source/atmos.mp4')
  assert.equal(normalized.outputDir, '/tmp/source')
  assert.equal(normalized.allowFpsConversion, true)
  assert.equal(normalized.overwrite, true)
})

test('buildAtmosMuxScriptArgs adds fps conversion and no-overwrite flags as needed', () => {
  const args = buildAtmosMuxScriptArgs({
    videoPath: '/tmp/video.mp4',
    atmosPath: '/tmp/atmos.mp4',
    outputDir: '/tmp/out',
    allowFpsConversion: false,
    overwrite: false,
  })

  assert.deepEqual(args, [
    '--video',
    '/tmp/video.mp4',
    '--atmos',
    '/tmp/atmos.mp4',
    '--output-dir',
    '/tmp/out',
    '--no-overwrite',
  ])
})

test('buildAtmosMuxRunPreview exposes a runnable payload only when required fields exist', () => {
  const incomplete = buildAtmosMuxRunPreview({
    videoPath: '/tmp/video.mp4',
  })
  assert.equal(incomplete.resourceId, ATMOS_MUX_RESOURCE_ID)
  assert.equal(incomplete.canRun, false)
  assert.equal(incomplete.args.length, 0)
  assert.match(incomplete.issues.join(' '), /atmosPath is required/)

  const complete = buildAtmosMuxRunPreview({
    videoPath: '/tmp/video.mp4',
    atmosPath: '/tmp/atmos.mp4',
    outputDir: '/tmp/out',
  })
  assert.equal(complete.canRun, true)
  assert.deepEqual(complete.args, [
    '--video',
    '/tmp/video.mp4',
    '--atmos',
    '/tmp/atmos.mp4',
    '--output-dir',
    '/tmp/out',
    '--allow-fps-conversion',
  ])
})

test('buildAtmosMuxToolRunRequest keeps the canonical tool id and normalized payload', () => {
  const request = buildAtmosMuxToolRunRequest({
    videoPath: ' /tmp/video.mp4 ',
    atmosPath: ' /tmp/atmos.mp4 ',
    outputDir: ' /tmp/out ',
    allowFpsConversion: false,
  })

  assert.deepEqual(request, {
    toolId: ATMOS_VIDEO_MUX_TOOL_ID,
    input: {
      videoPath: '/tmp/video.mp4',
      atmosPath: '/tmp/atmos.mp4',
      outputDir: '/tmp/out',
      allowFpsConversion: false,
      overwrite: true,
    },
  })
})

test('parseAtmosMuxOutputPath extracts output path from process stdout', () => {
  const parsedPath = parseAtmosMuxOutputPath('INFO\nOUTPUT_PATH=/tmp/out/Atmos_Output_20260412_101010.mp4\nDONE')
  assert.equal(parsedPath, '/tmp/out/Atmos_Output_20260412_101010.mp4')
  assert.equal(parseAtmosMuxOutputPath('no markers here'), '')
})

test('inferParentDirectory handles both unix and windows separators', () => {
  assert.equal(inferParentDirectory('/tmp/a/b.mp4'), '/tmp/a')
  assert.equal(inferParentDirectory('C:\\video\\source.mp4'), 'C:/video')
})
