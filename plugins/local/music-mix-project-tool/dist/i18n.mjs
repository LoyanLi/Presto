const messages = {
  en: {
    'manifest.displayName': 'Music Mix Project Tool',
    'manifest.description': 'Create a music mix project folder from one standard template with a selectable folder list.',
    'page.title': 'Music Mix Project Tool',
    'page.root.title': 'Music Mix Project Tool',
    'page.root.description': 'Create one music mix project folder and choose the directories for this run.',
    'section.setup': 'Setup',
    'field.date': 'Date',
    'field.songName': 'Song Name',
    'field.sections': 'Folders',
    'field.directoryEnabled': 'Include',
    'section.preview': 'Preview',
    'field.previewFolderName': 'Folder Name',
    'field.previewTargetPath': 'Target Path',
    'field.previewTargetPathPending': 'Choose destination when creating',
    'field.lastRun': 'Latest Result',
    'field.folderNamePlaceholder': 'Folder name',
    'action.create': 'Create Project',
    'action.openCreatedFolder': 'Open Created Folder',
    'action.addFolder': 'Add Folder',
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
