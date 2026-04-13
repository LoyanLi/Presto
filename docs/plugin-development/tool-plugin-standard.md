# Tool 插件规范

本文档只描述当前已经成立的 `tool` 插件协议边界，不扩展到未落地的宿主架构。

## 1. 适用场景

`tool` 插件用于独立工具型能力，例如文件处理、封装、转码、清理等。

这类插件的核心特点是：

- 页面挂载在 `Tools` 区域，不进 `Home` workflow 列表
- 不依赖当前 `DAW` 连接状态也可以提供能力
- 可以通过受限 host 和 bundled process 运行本地工具链

## 2. manifest 必须满足的结构

`tool` 插件的关键字段规则如下：

- `extensionType` 必须是 `"tool"`
- `supportedDaws` 必须是空数组 `[]`
- `pages[].mount` 必须是 `"tools"`
- 必须声明 `tools[]`，每个 tool 至少包含：
  - `toolId`
  - `pageId`
  - `title`
  - `runnerExport`
- 可选声明 `toolRuntimePermissions`
- 可选声明 `bundledResources`

当前 `toolRuntimePermissions` 枚举：

- `dialog.openFile`
- `dialog.openDirectory`
- `fs.read`
- `fs.write`
- `fs.list`
- `fs.delete`
- `shell.openPath`
- `process.execBundled`

当前 `bundledResources` 条目结构：

- `resourceId`
- `kind`（`script` 或 `binary`）
- `relativePath`

## 3. 页面能力边界

`tool` 页面组件收到 `PluginToolPageProps`，其中 `host` 允许的能力是：

- `dialog.openFile()`
- `dialog.openDirectory()`
- `fs.readFile(path)`
- `fs.writeFile(path, content)`
- `fs.exists(path)`
- `fs.readdir(path)`
- `fs.deleteFile(path)`
- `shell.openPath(path)`

这些能力只属于页面 host，不是 `activate(context)` 通用 runtime。

## 4. runner 能力边界

`tool` runner 的签名是：

```ts
type PluginToolRunner = (
  context: PluginToolRunnerContext,
  input: Record<string, unknown>,
) => Promise<PluginToolRunResult> | PluginToolRunResult
```

`PluginToolRunnerContext` 在 `PluginContext` 基础上增加：

- `dialog`
- `fs`
- `shell`
- `process.execBundled(resourceId, args?, options?)`

`process.execBundled` 只能执行 manifest 已声明的 `bundledResources`。

## 5. Settings 管理边界

`tool` 插件的扩展启用/禁用与问题管理归在 `Tool Extensions` 页面。

这和 `workflow` 插件的扩展管理入口是分开的，不应把 `tool` 插件文档写成 workflow 设置页体系的一部分。

## 6. 官方样例

当前 `tool` 官方参考样例：

- `official.atmos-video-mux-tool`
- `plugins/official/atmos-video-mux-tool/manifest.json`
- `plugins/official/atmos-video-mux-tool/dist/entry.mjs`

该样例基于本地 `DD视频一键封装工具` 算法，核心流程包括：

1. 选择视频源 MP4 和全景声源 MP4
2. 用 `ffprobe` 检测并比较帧率（阈值 `0.01`）
3. 帧率不一致时可先把视频转换到 Atmos 源帧率
4. 对两路输入做 demux，识别视频/立体声/Atmos 流
5. mux 时把 Atmos 音轨排在立体声之前，并传入输入视频帧率
6. 若出现 H.264 level 不兼容，使用 `h264_metadata=level=5.1` 修复后重试
7. 输出文件名使用 `Atmos_Output_YYYYMMDD_HHMMSS.mp4`

## 7. 当前 tool 页面 UI 约束

`tool` 页面当前应尽量复用现有 workflow 页面壳层，而不是重新发明一套独立工具页布局。

正式要求：

- 顶部标题由宿主 `Tools` 页面容器提供；插件页面内部不要重复渲染第二个页面标题
- 多步骤 tool 页面优先复用共享 `WorkflowStepper`、`WorkflowCard`、`WorkflowActionBar`、`WorkflowButton`、`WorkflowInput`
- 页面主体应使用“顶部 stepper + 中部滚动内容 + 底部 action bar”布局，让前进 / 后退 / 运行动作稳定吸附在窗口底部
- 底部 action bar 的视觉基线应与 workflow 保持一致：透明背景、无额外顶部分隔线、只保留当前步骤操作
- 文件 / 目录选择应使用一行输入框 + picker 按钮，不重复额外渲染完整路径块
- 结果区应保持紧凑，只展示当前状态、必要问题列表和结果摘要；不要把 `jobId`、重复路径和调试信息堆进正式页面

如果当前 tool 能力本质上是“独立工具，但交互形态接近 workflow”，应优先向 `official.import-workflow` / `official.export-workflow` 的页面骨架对齐，再补上 tool 特有的 host / runner 边界。
