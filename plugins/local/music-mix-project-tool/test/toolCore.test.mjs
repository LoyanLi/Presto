import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_DIRECTORY_LABELS,
  buildProjectTargetPath,
  buildSelectedDirectories,
  formatProjectFolderName,
  normalizeMusicMixProjectInput,
  validateMusicMixProjectInput,
} from '../dist/toolCore.mjs'

test('formatProjectFolderName normalizes the date and returns YYMMDD_歌名', () => {
  const normalized = normalizeMusicMixProjectInput({
    baseRoot: ' /Volumes/Mixes ',
    date: '2026-05-01',
    songName: '  夜空中最亮的星  ',
    sections: DEFAULT_DIRECTORY_LABELS,
  })

  assert.equal(formatProjectFolderName(normalized), '260501_夜空中最亮的星')
})

test('validateMusicMixProjectInput rejects empty date or song name', () => {
  assert.deepEqual(
    validateMusicMixProjectInput(
      normalizeMusicMixProjectInput({
        baseRoot: '/Volumes/Mixes',
        date: '',
        songName: '',
        sections: DEFAULT_DIRECTORY_LABELS,
      }),
    ),
    {
      ok: false,
      issues: ['date is required', 'songName is required'],
    },
  )
})

test('buildProjectTargetPath joins the base root with the canonical folder name', () => {
  const input = normalizeMusicMixProjectInput({
    baseRoot: ' /Volumes/Mixes/Projects/ ',
    date: '260501',
    songName: 'Blue Sky',
    sections: DEFAULT_DIRECTORY_LABELS,
  })

  assert.equal(buildProjectTargetPath(input), '/Volumes/Mixes/Projects/260501_Blue Sky')
})

test('buildSelectedDirectories applies fresh numeric prefixes in the selected order', () => {
  const directories = buildSelectedDirectories([
    'Exports',
    'Received',
    'Archive',
  ])

  assert.deepEqual(directories, [
    '01_Exports',
    '02_Received',
    '03_Archive',
  ])
})
