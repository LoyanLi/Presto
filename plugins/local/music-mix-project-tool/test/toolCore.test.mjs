import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SECTION_IDS,
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
    sections: DEFAULT_SECTION_IDS,
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
        sections: DEFAULT_SECTION_IDS,
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
    sections: DEFAULT_SECTION_IDS,
  })

  assert.equal(buildProjectTargetPath(input), '/Volumes/Mixes/Projects/260501_Blue Sky')
})

test('buildSelectedDirectories preserves the selected section order', () => {
  const directories = buildSelectedDirectories([
    '03_Exports',
    '01_Received',
    '05_Archive',
  ])

  assert.deepEqual(directories, [
    '03_Exports',
    '01_Received',
    '05_Archive',
  ])
})
