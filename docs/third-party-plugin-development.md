# Presto 第三方插件编写

本文档面向第三方插件开发者，说明当前 Presto 插件系统的真实接入方式、manifest 结构、模块导出要求、权限模型、设置页模型和加载限制。

本文档只描述当前代码已经体现出来的插件协议与宿主行为，不描述尚未实现的插件生态规划。

## 0. 第三方插件作者最容易搞混的三类“命令”

在当前 Presto 插件体系里，外部作者最容易把三种东西混成同一个“命令”概念：

1. capability 调用命令
2. runtime 服务命令
3. manifest `commands` UI 命令

它们的区别必须先讲清楚。

### 0.1 capability 调用命令

这是插件在 `context.presto` 上调用的业务能力，例如：

- `context.presto.track.rename(request)`
- `context.presto.export.run.start(request)`
- `context.presto.daw.connection.getStatus()`

这类调用最终进入后端 capability 链路。

### 0.2 runtime 服务命令

这是插件在 `context.runtime` 上调用的宿主服务，例如：

- `context.runtime.dialog.openFolder()`
- `context.runtime.fs.readFile(path)`
- `context.runtime.macAccessibility.runScript(script)`

这类调用由 Electron 主进程代理，不经过后端业务 handler。

### 0.3 manifest `commands`

这是你在 manifest 中声明给宿主 UI 用的命令入口，例如“打开某个插件页面”。

它不是权限通道，也不是高能力 API。它只是让宿主知道应该在 UI 中展示什么命令。

## 1. 插件系统定位

Presto 当前插件系统支持把以下内容接入宿主：

- 工作流页面
- 自动化入口
- 设置页
- 导航项
- 命令项

插件不是直接嵌入宿主私有对象，而是通过一份明确 manifest 和一个入口模块接入。

当前宿主对插件的基本原则是：

- 先校验
- 再加载
- 再裁剪权限
- 最后挂载

如果你把插件当成“可以任意执行宿主 API 的脚本包”，那就理解错了。

当前实现里，插件也拿不到长期暴露在 `window` 上的私有宿主桥。宿主先通过一次性 bootstrap 句柄完成自身装配，再把裁剪后的 `PluginContext` 传给插件。

## 2. 插件最小目录结构

当前最小可识别结构应为：

```text
my-plugin/
├── manifest.json
└── dist/
    └── entry.mjs
```

可选资源：

```text
my-plugin/
├── manifest.json
└── dist/
    ├── entry.mjs
    └── style.css
```

其中：

- `manifest.json` 是插件声明入口
- `entry.mjs` 是插件模块入口
- `styleEntry` 若声明，宿主会按 manifest 指定路径读取样式资源

## 3. manifest 核心字段

当前 `WorkflowPluginManifest` 中最重要的字段如下。

### 3.1 身份字段

- `pluginId`
- `displayName`
- `description`
- `version`

用途：

- 标识插件身份
- 在宿主中展示插件信息
- 参与安装目录命名与问题定位

### 3.2 兼容字段

- `hostApiVersion`
- `supportedDaws`
- `uiRuntime`

当前事实：

- `uiRuntime` 当前使用 `react18`
- `supportedDaws` 对当前宿主实际应写 `pro_tools`

### 3.3 入口字段

- `entry`
- `styleEntry`

要求：

- `entry` 必须能被宿主动态导入
- 导入后的模块必须符合 `WorkflowPluginModule` 契约

### 3.4 扩展内容字段

- `pages`
- `automationItems`
- `settingsPages`
- `navigationItems`
- `commands`

这些字段决定插件把什么东西挂进宿主。

### 3.5 权限字段

- `requiredCapabilities`
- `requiredRuntimeServices`
- `adapterModuleRequirements`
- `capabilityRequirements`

这些字段决定插件能做什么、宿主是否接受它。

## 3.6 最小可工作的 manifest 示例

```json
{
  "pluginId": "thirdparty.example-workflow",
  "extensionType": "workflow",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": ["pro_tools"],
  "uiRuntime": "react18",
  "displayName": "Example Workflow",
  "description": "Example third-party workflow plugin for Presto.",
  "entry": "dist/entry.mjs",
  "pages": [
    {
      "pageId": "example.page.main",
      "path": "/plugins/example-workflow",
      "title": "Example Workflow",
      "mount": "workspace",
      "componentExport": "ExampleWorkflowPage"
    }
  ],
  "navigationItems": [
    {
      "itemId": "example.nav.main",
      "title": "Example Workflow",
      "pageId": "example.page.main",
      "section": "sidebar",
      "order": 100
    }
  ],
  "commands": [
    {
      "commandId": "example.open",
      "title": "Open Example Workflow",
      "pageId": "example.page.main"
    }
  ],
  "requiredCapabilities": [
    "daw.connection.getStatus",
    "track.list",
    "track.rename",
    "jobs.get"
  ],
  "requiredRuntimeServices": [
    "automation.listDefinitions",
    "automation.runDefinition",
    "dialog.openFolder",
    "fs.readFile",
    "fs.readdir"
  ]
}
```

如果插件需要 mac 辅助功能，还必须额外声明：

```json
{
  "requiredRuntimeServices": [
    "macAccessibility.preflight",
    "macAccessibility.runScript"
  ]
}
```

## 4. 入口模块要求

插件入口模块必须导出 `WorkflowPluginModule` 形态，即至少包含：

- `manifest`
- `activate(context)`

可选：

- `deactivate()`

也就是说，宿主加载模块后不会去猜你的导出结构。它只接受符合契约的模块。

错误示例：

- 只导出页面组件，不导出 `manifest`
- `activate` 不是函数
- `manifest` 与 `manifest.json` 语义不一致

这些情况都会导致插件不能被视为有效模块。

## 5. 插件发现与加载流程

当前宿主对插件的处理流程大致如下：

1. 扫描插件根目录或受管目录
2. 查找 `manifest.json`
3. 读取 manifest
4. 执行 manifest 校验
5. 执行权限字段校验
6. 执行 `supportedDaws` 校验
7. 计算入口路径并尝试动态导入
8. 若成功，纳入插件清单
9. Renderer 侧再进行页面、命令、设置页、自动化项挂载，并只向插件注入裁剪后的 `PluginContext`

这一流程意味着插件不是“复制进去就一定可用”，而是“复制进去后进入一套严格校验流程”。

## 6. 插件权限模型

这是插件开发里最重要的部分。

### 6.1 Capability 权限

`requiredCapabilities` 表示插件需要访问哪些业务能力。

例如：

- `import.run.start`
- `jobs.get`
- `track.rename`
- `session.save`

如果插件未声明某个 capability，却在 `context.presto` 上调用对应方法，宿主运行时会拒绝访问。

### 6.2 Runtime 权限

`requiredRuntimeServices` 表示插件需要访问哪些宿主运行时服务。

例如：

- `automation.listDefinitions`
- `automation.runDefinition`
- `dialog.openFolder`
- `fs.readFile`
- `shell.openPath`
- `mobileProgress.createSession`

未声明的 runtime 服务不会被正常暴露给插件调用。当前允许声明的服务名由 `packages/contracts-manifest/runtime-services.json` 与 `packages/contracts-manifest/plugin-permissions.json` 共同约束，并由 `guardRuntimeAccess.ts` 实际裁剪。

### 6.3 这意味着什么

Presto 的插件权限是“默认不开放”的。你必须显式声明需要什么，宿主才会注入对应受限 API。

## 6.4 现在开发插件时到底可以用哪些命令

这一节是当前外部接入文档里最重要的部分。它回答的不是“理论上接口长什么样”，而是“今天写插件时哪些调用可以真正依赖”。

### 可直接依赖的 capability 命令

当前插件可通过 `requiredCapabilities` 声明并调用的公共能力包括：

- `system.health`
- `config.get`
- `config.update`
- `daw.connection.connect`
- `daw.connection.disconnect`
- `daw.connection.getStatus`
- `daw.adapter.getSnapshot`
- `automation.splitStereoToMono.execute`
- `session.getInfo`
- `session.getLength`
- `session.save`
- `session.applySnapshot`
- `session.getSnapshotInfo`
- `track.list`
- `track.listNames`
- `track.selection.get`
- `track.rename`
- `track.select`
- `track.color.apply`
- `track.pan.set`
- `track.mute.set`
- `track.solo.set`
- `clip.selectAllOnTrack`
- `transport.play`
- `transport.stop`
- `transport.record`
- `transport.getStatus`
- `import.run.start`
- `stripSilence.open`
- `stripSilence.execute`
- `export.range.set`
- `export.start`
- `export.direct.start`
- `export.run.start`
- `export.mixWithSource`
- `jobs.create`
- `jobs.update`
- `jobs.get`
- `jobs.list`
- `jobs.cancel`
- `jobs.delete`

外部作者在写插件时应理解为：

- 这是一套能力级公开 API
- 不是底层 adapter 或脚本执行权限

### 可直接依赖的 runtime 服务命令

当前插件可通过 `requiredRuntimeServices` 声明并调用的稳定 runtime 服务包括：

- `automation.listDefinitions`
- `automation.runDefinition`
- `dialog.openFolder`
- `shell.openPath`
- `shell.openExternal`
- `fs.readFile`
- `fs.getHomePath`
- `fs.writeFile`
- `fs.ensureDir`
- `fs.readdir`
- `fs.stat`
- `mobileProgress.createSession`
- `mobileProgress.closeSession`
- `mobileProgress.getViewUrl`
- `mobileProgress.updateSession`
- `macAccessibility.preflight`
- `macAccessibility.runScript`
- `macAccessibility.runFile`

这些是当前插件权限校验和 runtime guard 真正覆盖到的服务。

## 6.5 最常用命令的参数速查

### DAW 连接

- `context.presto.daw.connection.connect({ host?, port?, timeoutSeconds? })`
- `context.presto.daw.connection.getStatus()`
- `context.presto.daw.connection.disconnect()`

### 轨道操作

- `context.presto.track.rename({ currentName, newName })`
- `context.presto.track.select({ trackName })`
- `context.presto.track.color.apply({ trackName, colorSlot })`
- `context.presto.track.pan.set({ trackName, value })`
- `context.presto.track.mute.set({ trackNames, enabled })`
- `context.presto.track.solo.set({ trackNames, enabled })`

### 导入

- `context.presto.import.run.start({ folderPaths, orderedFilePaths?, host?, port?, timeoutSeconds? })`

### Strip Silence

- `context.presto.stripSilence.open()`
- `context.presto.stripSilence.execute({ trackName, profile })`

### 导出

- `context.presto.export.range.set({ inTime, outTime })`
- `context.presto.export.start({ outputPath, fileName, fileType, ... })`
- `context.presto.export.direct.start({ outputPath, fileName, fileType, ... })`
- `context.presto.export.mixSource.list({ sourceType })`
- `context.presto.export.run.start({ snapshots, exportSettings?, ... })`

### Jobs

- `context.presto.jobs.get(jobId)`
- `context.presto.jobs.list(filter?)`
- `context.presto.jobs.cancel(jobId)`
- `context.presto.jobs.delete(jobId)`

### Runtime

- `context.runtime.dialog.openFolder()`
- `context.runtime.fs.readFile(path)`
- `context.runtime.fs.writeFile(path, content)`
- `context.runtime.mobileProgress.createSession(taskId)`
- `context.runtime.macAccessibility.preflight()`
- `context.runtime.macAccessibility.runScript(script, args?)`
- `context.runtime.macAccessibility.runFile(path, args?)`

## 7. 插件上下文 `PluginContext`

当前插件 `activate(context)` 会收到 `PluginContext`，其中包括：

- `pluginId`
- `locale`
- `presto`
- `runtime`
- `storage`
- `logger`

### 7.1 `presto`

受 capability 白名单裁剪的业务能力客户端。

### 7.2 `runtime`

受 runtime 白名单裁剪的宿主服务客户端。

### 7.3 `storage`

宿主提供的插件存储接口，并且会按 `pluginId` 自动命名空间隔离。

这意味着不同插件不会直接共享同一个裸 key 空间。

### 7.4 `logger`

宿主包装过的 logger，日志内容会带插件前缀，方便排查。

## 7.5 `PluginContext` 中与 Pro Tools 的真实关系

当前很多插件能力最终会落到底层 Pro Tools 适配器，但插件作者要把这个边界理解准确：

- 插件不会拿到 `ProToolsDawAdapter`
- 插件不会拿到 py-ptsl
- 插件拿到的是 `context.presto` 上的一组公开能力

也就是说，插件与 Pro Tools 之间不是对象直连关系，而是：

```text
Plugin
  -> context.presto capability
  -> backend capability handler
  -> ProToolsDawAdapter
```

所以当文档说“插件支持 Pro Tools”时，准确含义应是：

- 插件可调用当前对外公开的 Pro Tools 相关 capability
- 不是插件可直接操作 Pro Tools adapter 内部实现

## 7.6 `PluginContext` 中与 mac 辅助功能的真实关系

对 `macAccessibility` 也必须保持同样精度。

插件当前能直接访问的是：

- `context.runtime.macAccessibility.preflight()`
- `context.runtime.macAccessibility.runScript(script, args?)`
- `context.runtime.macAccessibility.runFile(path, args?)`

插件当前不能直接访问的是：

- 后端内部辅助功能 internal capability
- 宿主私有 mac automation engine
- 未经 runtime guard 放行的宿主内部对象

因此，对外开发者应把 mac 辅助功能理解为：

- “宿主代执行的受控 runtime 服务”
- 不是“插件拿到系统级自动化对象”

## 7.7 Pro Tools 相关插件示例

### 示例 1：检查连接并列出轨道

```ts
const status = await context.presto.daw.connection.getStatus()
if (!status.connected) {
  await context.presto.daw.connection.connect({
    host: '127.0.0.1',
    port: 31416,
    timeoutSeconds: 5,
  })
}

const tracks = await context.presto.track.list()
context.logger.info('tracks loaded', { count: tracks.tracks.length })
```

### 示例 2：重命名并选中轨道

```ts
await context.presto.track.rename({
  currentName: 'Audio 1',
  newName: 'LeadVox_Main',
})

await context.presto.track.select({
  trackName: 'LeadVox_Main',
})
```

## 7.8 mac 辅助功能插件示例

### 示例 1：先做授权检查

```ts
const preflight = await context.runtime.macAccessibility?.preflight()
if (!preflight?.ok || !preflight.trusted) {
  throw new Error(preflight?.error ?? 'mac accessibility is not trusted')
}
```

### 示例 2：执行内联 AppleScript

```ts
const result = await context.runtime.macAccessibility?.runScript(
  'on run argv\nreturn \"ok\"\nend run',
)

if (!result?.ok) {
  throw new Error(result?.error?.message ?? 'mac accessibility script failed')
}
```

### 示例 3：执行文件脚本

```ts
await context.runtime.macAccessibility?.runFile(
  '/Users/me/scripts/presto-helper.applescript',
  ['arg1', 'arg2'],
)
```

## 8. 页面型插件

如果你的插件要提供工作区页面，需要在 manifest 中声明 `pages`。

页面定义当前至少要明确：

- `pageId`
- `path`
- `title`
- `mount`
- `componentExport`

当前稳定挂载点应理解为：

- `mount: "workspace"`

因此，如果你在设计插件页面时假设存在更多挂载区域，应视为未被当前代码保证的行为。

## 9. 自动化型插件

如果你的插件属于自动化扩展，则使用：

- `extensionType: "automation"`
- `automationItems`

这类插件当前不一定需要页面，但需要提供自动化入口定义，例如：

- `itemId`
- `title`
- `automationType`
- `description`
- `order`

宿主会将其挂入自动化区域，而不是工作区页面系统。

## 10. 设置页插件

如果插件需要配置项，应使用 `settingsPages`。

当前设置页系统不是让插件随意渲染整页，而是让插件声明结构化配置，包括：

- `pageId`
- `title`
- `order`
- `storageKey`
- `loadExport`
- `saveExport`
- `defaults`
- `sections`

这意味着你需要同时提供：

1. manifest 中的设置页结构定义
2. 入口模块中对应的 `loadExport` / `saveExport` 函数

这样宿主才能把插件设置页纳入统一设置框架。

## 11. 命令与导航

插件还可以声明：

- `navigationItems`
- `commands`

其作用分别是：

- 决定插件如何出现在宿主导航中
- 决定宿主如何把插件动作暴露为命令入口

当前做法的好处是：

- 页面、导航、命令彼此解耦
- 宿主可以按统一信息架构组织插件入口

这里必须再次强调：

- manifest 中的 `commands` 只是 UI 入口定义
- 它不会自动赋予 capability 权限
- 也不会自动赋予 runtime 权限

换句话说，声明了：

```json
{
  "commandId": "my-plugin.open",
  "title": "Open My Plugin",
  "pageId": "my-plugin.page.main"
}
```

只意味着宿主可以展示这个命令入口。

它不意味着插件因此获得：

- 文件系统访问
- DAW 控制访问
- mac 辅助功能访问

这些权限仍然必须分别通过：

- `requiredCapabilities`
- `requiredRuntimeServices`

来声明。

## 12. 版本与兼容性要求

第三方插件在当前系统下至少要满足以下条件：

1. `hostApiVersion` 必须在宿主允许范围内
2. `supportedDaws` 必须覆盖当前运行 DAW
3. `entry` 模块必须可导入
4. 导出的模块必须符合 `WorkflowPluginModule`
5. `requiredCapabilities` 和 `requiredRuntimeServices` 必须合法

若不满足其中任意一条，插件都可能进入 issue 列表，而不是 ready 状态。

## 13. 插件安装方式

当前宿主支持的安装来源包括：

- 本地目录安装
- 本地 zip 安装
- 官方插件同步

这三种路径最终都会进入同一套插件发现、校验和加载模型。区别只在于来源，不在于权限待遇。

因此，不存在“本地装的插件更自由”这种隐式行为。

## 14. 建议的开发流程

第三方插件开发建议遵循以下顺序：

1. 先写 manifest，明确能力与权限范围
2. 再实现 `entry.mjs`
3. 再实现页面或自动化入口
4. 再实现设置页 load/save
5. 最后在本地目录安装到 Presto 里验证

不要反过来先写大量页面，再临时补 manifest。因为宿主最终接受的是协议化插件，不是自由页面包。

## 15. 当前最重要的边界

若只记住一句话，应记住：

Presto 第三方插件当前是“manifest 驱动、权限白名单驱动、宿主受控装载”的扩展机制，而不是任意代码注入机制。

## 16. 给外部作者的最短判断规则

当你在写插件时，不确定一个“命令”现在能不能用，可以按下面四步判断：

1. 它是 `context.presto` 里的 capability，还是 `context.runtime` 里的 runtime 服务，还是 manifest 的 UI command。
2. 如果是 capability，看它是否属于公共 capability 列表。
3. 如果是 runtime，看它是否在当前稳定 runtime 服务白名单里。
4. 最后确认你的 manifest 已声明对应权限。

只有这四步都成立，才把它当成“现在已经支持”的插件开发接口。

## 17. 常见失败场景

### 权限声明不完整

现象：

- 调用 capability 或 runtime 时直接被拒绝。

排查：

- 检查 `requiredCapabilities`
- 检查 `requiredRuntimeServices`

### DAW 未连接

现象：

- 轨道、session、导入导出相关能力失败。

排查：

- 先调用 `context.presto.daw.connection.getStatus()`
- 再决定是否调用 `connect()`

### mac 辅助功能未授权

现象：

- `preflight().trusted === false`
- `runScript()` / `runFile()` 返回错误

排查：

- 先跑 `preflight()`
- 不要在未授权状态下直接假设脚本可执行

### 任务不存在

现象：

- `jobs.get()` / `jobs.cancel()` 报 `JOB_NOT_FOUND`

排查：

- 确认 `jobId` 来自本次真实启动返回
- 不要缓存陈旧任务 ID
