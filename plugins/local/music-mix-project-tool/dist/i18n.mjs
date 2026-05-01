const messages = {
  en: {
    'manifest.displayName': 'Music Mix Project Tool',
    'manifest.description': 'Create a music mix project folder from one fixed template under a remembered base root.',
    'page.title': 'Music Mix Project Tool',
    'page.root.title': 'Project Setup',
    'page.root.description': 'Create one standard music mix project folder with only the sections you need.',
    'field.baseRoot': 'Base Root',
    'field.baseRootHint': 'Remembered as the default base root',
    'field.date': 'Date',
    'field.songName': 'Song Name',
    'field.sections': 'Sections',
    'field.previewFolderName': 'Folder Name',
    'field.previewTargetPath': 'Target Path',
    'field.lastRun': 'Latest Result',
    'action.browse': 'Browse',
    'action.create': 'Create Project',
    'action.openCreatedFolder': 'Open Created Folder',
    'status.ready': 'Ready to create the project folder.',
    'status.running': 'Creating project folder…',
    'status.directorySelectionCanceled': 'Directory selection canceled.',
    'status.openedFolder': 'Opened the created folder.',
    'status.createFailed': 'Failed to create the project folder.',
    'summary.created': 'Music mix project created: {createdRoot}',
  },
}

export function resolveMusicMixProjectLocale(input) {
  const candidates = [input?.resolved, input?.requested, input?.locale?.resolved, input?.locale?.requested, input?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
    ? 'en'
    : 'en'
}

export function tMusicMixProject(input, key, replacements = {}) {
  const locale = resolveMusicMixProjectLocale(input)
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value)),
    messages[locale][key] ?? messages.en[key] ?? key,
  )
}
