const messages = {
  en: {
    'manifest.displayName': 'Atmos Video Mux Tool',
    'manifest.description': 'Merge a high-quality video MP4 with Dolby Atmos MP4 audio using the official one-click mux algorithm sample.',
    'manifest.pageTitle': 'Atmos Video Mux',
    'manifest.toolDescription': 'Combine a video MP4 and Atmos MP4 into an output MP4 with FPS alignment and level-repair retry.',
    'step.sources': 'Sources',
    'step.outputReviewRun': 'Output / Review / Run',
    'status.completed': 'Completed',
    'status.failed': 'Failed',
    'status.running': 'Running',
    'status.readyToRun': 'Ready to run',
    'status.missingRequiredInput': 'Missing required input',
    'status.videoSelectionCanceled': 'Video selection canceled.',
    'status.videoStaged': 'Video source staged.',
    'status.atmosSelectionCanceled': 'Atmos selection canceled.',
    'status.atmosStaged': 'Atmos source staged.',
    'status.outputSelectionCanceled': 'Output directory selection canceled.',
    'status.outputStaged': 'Output directory staged.',
    'status.runningTool': 'Running Atmos video mux...',
    'status.finished': 'Atmos video mux finished.',
    'status.failedTool': 'Atmos video mux failed.',
    'status.outputFile': 'Output file: {fileName}',
    'page.sources.title': 'Source files',
    'page.sources.subtitle': 'Stage the mastered picture MP4 and the Dolby Atmos MP4 input.',
    'field.video': 'Video MP4',
    'placeholder.video': 'Select the mastered video MP4',
    'button.pickVideo': 'Pick video MP4',
    'copy.video': 'Pick the mastered picture file that will anchor the mux job.',
    'note.videoMissing': 'Video source not selected yet.',
    'field.atmos': 'Atmos MP4',
    'placeholder.atmos': 'Select the Atmos MP4 source',
    'button.pickAtmos': 'Pick Atmos MP4',
    'copy.atmos': 'Use the official dual-MP4 Atmos input file.',
    'note.atmosMissing': 'Atmos source not selected yet.',
    'toggle.allowFpsConversion.title': 'Allow FPS conversion',
    'toggle.allowFpsConversion.hint': 'Convert the video FPS when the source mismatch exceeds 0.01 before muxing.',
    'page.output.title': 'Output / Review / Run',
    'page.output.subtitle': 'Set the output folder, review the staged inputs, and run the mux job.',
    'field.outputDir': 'Output directory',
    'placeholder.outputDir': 'Select an output directory',
    'button.pickOutputDir': 'Pick output directory',
    'copy.outputDir': 'Defaults to the video file parent folder until you override it here.',
    'note.outputDirMissing': 'Output directory not selected yet.',
    'button.previous': 'Previous',
    'button.next': 'Next: Output / Review / Run',
    'button.run': 'Run Atmos Mux',
    'button.running': 'Running...',
    'note.selectSources': 'Select both source files to continue.',
    'picker.filterName': 'MP4 Video',
    'validation.videoRequired': 'videoPath is required.',
    'validation.atmosRequired': 'atmosPath is required.',
    'validation.outputDirRequired': 'outputDir is required.',
    'runner.invalidInput': 'Cannot run Atmos Video Mux tool: {issues}',
    'runner.processFailed': 'Atmos video mux process failed. {details}',
    'runner.summaryWithOutput': 'Atmos video mux completed: {outputPath}',
    'runner.summary': 'Atmos video mux completed.',
  },
  'zh-CN': {
    'manifest.displayName': 'Atmos 视频合成工具',
    'manifest.description': '使用官方一键合成示例，把高质量视频 MP4 与杜比 Atmos MP4 音频合成为一个输出 MP4。',
    'manifest.pageTitle': 'Atmos 视频合成',
    'manifest.toolDescription': '把视频 MP4 与 Atmos MP4 合成为输出 MP4，并处理 FPS 对齐与 level 修复重试。',
    'step.sources': '源文件',
    'step.outputReviewRun': '输出 / 检查 / 执行',
    'status.completed': '已完成',
    'status.failed': '失败',
    'status.running': '执行中',
    'status.readyToRun': '可以执行',
    'status.missingRequiredInput': '缺少必填输入',
    'status.videoSelectionCanceled': '已取消视频选择。',
    'status.videoStaged': '视频源已就绪。',
    'status.atmosSelectionCanceled': '已取消 Atmos 文件选择。',
    'status.atmosStaged': 'Atmos 源已就绪。',
    'status.outputSelectionCanceled': '已取消输出目录选择。',
    'status.outputStaged': '输出目录已就绪。',
    'status.runningTool': '正在执行 Atmos 视频合成…',
    'status.finished': 'Atmos 视频合成已完成。',
    'status.failedTool': 'Atmos 视频合成失败。',
    'status.outputFile': '输出文件：{fileName}',
    'page.sources.title': '源文件',
    'page.sources.subtitle': '准备母版视频 MP4 和 Dolby Atmos MP4 输入文件。',
    'field.video': '视频 MP4',
    'placeholder.video': '选择母版视频 MP4',
    'button.pickVideo': '选择视频 MP4',
    'copy.video': '选择将作为合成基准的母版视频文件。',
    'note.videoMissing': '还没有选择视频源。',
    'field.atmos': 'Atmos MP4',
    'placeholder.atmos': '选择 Atmos MP4 源文件',
    'button.pickAtmos': '选择 Atmos MP4',
    'copy.atmos': '使用官方双 MP4 Atmos 输入文件。',
    'note.atmosMissing': '还没有选择 Atmos 源。',
    'toggle.allowFpsConversion.title': '允许 FPS 转换',
    'toggle.allowFpsConversion.hint': '当源文件 FPS 差异超过 0.01 时，先转换视频 FPS 再进行合成。',
    'page.output.title': '输出 / 检查 / 执行',
    'page.output.subtitle': '设置输出目录，检查已准备的输入，然后执行合成任务。',
    'field.outputDir': '输出目录',
    'placeholder.outputDir': '选择输出目录',
    'button.pickOutputDir': '选择输出目录',
    'copy.outputDir': '默认使用视频文件所在目录，除非你在这里改成其他位置。',
    'note.outputDirMissing': '还没有选择输出目录。',
    'button.previous': '上一步',
    'button.next': '下一步：输出 / 检查 / 执行',
    'button.run': '执行 Atmos 合成',
    'button.running': '执行中...',
    'note.selectSources': '先选择两个源文件后再继续。',
    'picker.filterName': 'MP4 视频',
    'validation.videoRequired': '必须提供 videoPath。',
    'validation.atmosRequired': '必须提供 atmosPath。',
    'validation.outputDirRequired': '必须提供 outputDir。',
    'runner.invalidInput': '无法执行 Atmos 视频合成工具：{issues}',
    'runner.processFailed': 'Atmos 视频合成进程失败。{details}',
    'runner.summaryWithOutput': 'Atmos 视频合成已完成：{outputPath}',
    'runner.summary': 'Atmos 视频合成已完成。',
  },
}

export function resolveAtmosLocale(input) {
  const candidates = [input?.resolved, input?.requested, input?.locale?.resolved, input?.locale?.requested, input?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
    ? 'zh-CN'
    : 'en'
}

export function tAtmos(input, key, replacements = {}) {
  const locale = resolveAtmosLocale(input)
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value)),
    messages[locale][key] ?? messages.en[key] ?? key,
  )
}

export function translateAtmosPreviewIssue(input, issue) {
  if (issue === 'videoPath is required.') {
    return tAtmos(input, 'validation.videoRequired')
  }
  if (issue === 'atmosPath is required.') {
    return tAtmos(input, 'validation.atmosRequired')
  }
  if (issue === 'outputDir is required.') {
    return tAtmos(input, 'validation.outputDirRequired')
  }
  return issue
}
