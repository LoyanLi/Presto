# Presto SDK 开发

本文档面向需要接入或扩展 Presto SDK 的开发者，重点说明当前 SDK 的组成、职责边界、装配方式、调用模型以及新增能力的正确路径。

这里的 SDK 不是一个单包概念，而是由三层共同组成：

1. `contracts`
2. `sdk-core`
3. `sdk-runtime`

如果不先理解这三层边界，就很容易把类型、协议、宿主能力和业务能力混在一起。

## 0. 外部接入者最先要分清的三种“命令”

在 Presto 里，外部开发者通常会把所有可调用项都叫“命令”，但当前系统实际上存在三种完全不同的东西：

### 0.1 Capability 调用命令

这是插件和宿主通过 `presto` 客户端调用的业务能力，例如：

- `presto.daw.connection.getStatus()`
- `presto.track.rename(request)`
- `presto.export.run.start(request)`

这类调用最终会进入后端 capability invoke 链路。

### 0.2 Runtime 服务命令

这是插件和宿主通过 `runtime` 客户端调用的桌面宿主服务，例如：

- `runtime.dialog.openFolder()`
- `runtime.fs.readFile(path)`
- `runtime.macAccessibility.runScript(script, args)`

这类调用不会进入后端业务 handler，而是经由 Electron 主进程代理系统能力。

### 0.3 Plugin manifest `commands`

这是插件在 manifest 里声明给宿主 UI 展示的命令入口，例如“打开某个插件页面”。

它不是一个额外的高权限 API，也不是 capability。它只是宿主用来生成命令入口的声明数据。

如果不把这三类东西拆开，文档和插件实现都会很快混乱。

## 1. SDK 分层概览

### 1.1 `packages/contracts`

作用：

- 定义 capability ID
- 定义 request/response 类型
- 定义插件 manifest 和 plugin context
- 定义 runtime service 名称
- 定义错误与事件模型

它负责类型面与协议面定义，但不是所有运行时白名单数据的唯一文件来源。任何 SDK 开发都不能绕过这一层直接发明私有协议。

### 1.1.1 `packages/contracts-manifest`

作用：

- 定义 capability 白名单
- 定义 runtime service 白名单
- 定义插件权限允许集合
- 生成供 TypeScript、Python 与插件运行时共用的派生产物

当前 `scripts/generate-contracts.mjs` 会把这里的 manifest 生成为：

- `packages/contracts/src/generated/capabilityRegistry.ts`
- `host-plugin-runtime/src/discovery/generated/runtimeServices.ts`
- `backend/presto/application/capabilities/catalog_generated.py`

### 1.2 `packages/sdk-core`

作用：

- 以能力为中心装配 `PrestoClient`
- 把 capability invoke 统一封装为领域 client

典型领域 client：

- `system`
- `config`
- `daw`
- `automation`
- `session`
- `track`
- `clip`
- `transport`
- `import`
- `export`
- `stripSilence`
- `jobs`

它面向的是“业务能力调用”。

### 1.3 `packages/sdk-runtime`

作用：

- 描述宿主运行时能力
- 为 Renderer 或插件提供桌面宿主服务客户端类型

当前 runtime client 包括：

- `app`
- `automation`
- `backend`
- `dialog`
- `shell`
- `fs`
- `mobileProgress`
- `macAccessibility`
- `window`

它面向的是“宿主环境服务访问”，不是后端业务能力。

## 2. 最重要的边界

SDK 使用时必须始终分清以下两种调用：

### 2.1 Capability 调用

走 `sdk-core`

用途：

- 访问后端业务能力
- 触发 DAW 相关操作
- 获取 jobs 状态

### 2.2 Runtime 调用

走 `sdk-runtime`

用途：

- 打开目录选择器
- 打开系统路径
- 访问宿主文件系统代理
- 调用移动进度服务
- 访问无障碍脚本运行器

如果某个调用本质上需要后端业务语义，就不应该伪装成 runtime；如果某个调用只是宿主系统能力，就不应该伪装成 capability。

## 2.1 当前外部接入者可依赖的总原则

对于外部插件作者，判断“现在能不能用”的顺序应该是：

1. 类型里是否存在
2. 宿主当前是否真的提供
3. 插件权限校验是否允许声明
4. `guardCapabilityAccess` 或 `guardRuntimeAccess` 是否真的放行

只有四步都成立，才算“当前可依赖”。

因此：

- “类型定义里有”不等于“第三方插件当前可用”
- “宿主内部在用”不等于“插件当前可调”

## 3. `contracts` 与 `contracts-manifest` 的角色

### 3.1 为什么要拆成“类型面”和“运行时事实源”

因为当前 Presto 横跨：

- 前端宿主
- 后端
- 插件
- SDK

只要其中任意两端各自发明协议，就会立刻出现漂移。

因此以下定义必须首先存在于 `contracts`：

- capability ID
- capability schema
- `PrestoClient` 领域接口
- `PluginContext`
- `WorkflowPluginManifest`
- `PluginRuntimeServiceName`

而以下运行时事实当前以 `contracts-manifest` 为准，并通过生成产物分发：

- capability 清单
- runtime service 清单
- 插件可声明的 runtime 权限清单

### 3.2 开发规则

任何跨边界调用新增，都应先在 `contracts` 中定义类型，再更新 `contracts-manifest`，随后生成产物，再落地到 `sdk-core`、`sdk-runtime`、主进程或后端。

## 4. `sdk-core` 的装配模型

`packages/sdk-core/src/createPrestoClient.ts` 当前的装配方式是：

1. 接收一个 `transport`
2. 维护 `requestSequence`
3. 为每次能力调用生成 `requestId`
4. 通过统一 `invokeCapability()` 发送 envelope
5. 返回分领域 client 组合而成的 `PrestoClient`

### 4.1 设计含义

这说明 `sdk-core` 不是直接依赖 HTTP，也不是直接依赖 Electron IPC。它依赖的是一个更抽象的 `PrestoTransport`。

收益：

- transport 可替换
- 前端和插件只依赖统一能力客户端
- 能力错误处理可集中

### 4.2 当前错误行为

当前 `invokeCapability()` 的行为是：

- 如果 response `success === false`
- 直接抛出 `response.error`

这意味着 SDK 用户在调用时应当把能力失败视为异常路径，而不是再手动判断 success flag。

## 5. `sdk-runtime` 的装配模型

`packages/sdk-runtime/src/createPrestoRuntime.ts` 当前非常薄，作用是把各 runtime client 组合为 `PrestoRuntime`。

这层之所以保持简单，是为了强调：

- runtime 的核心复杂度不在组合函数
- 而在宿主侧如何提供这些 client

真正的桥接复杂度在：

- `frontend/electron/runtime/runtimeBridge.ts`
- `registerRuntimeHandlers.mjs`
- `frontend/electron/preload.ts`
- `frontend/electron/renderer.tsx`

也就是说，`sdk-runtime` 当前更接近一套“类型与装配壳”，而不是复杂业务层。

## 6. 插件看到的 SDK 面是什么

插件不会直接拿到所有宿主内部对象。它通过 `PluginContext` 获得：

- `presto`
- `runtime`
- `storage`
- `logger`
- `locale`

其中：

- `presto` 本质上是受 manifest 白名单裁剪过的 `PrestoClient`
- `runtime` 本质上是受 manifest 白名单裁剪过的 `PrestoRuntime` 子集

插件不会直接持有宿主私有全局桥。当前实现是 Renderer 先通过一次性 `__PRESTO_BOOTSTRAP__` 取走宿主能力，再由宿主把裁剪后的 `PluginContext` 交给插件。

这意味着插件开发时看到的“SDK 面”不是完整 SDK，而是受限 SDK。

## 6.1 当前插件可调用的 Capability 命令总表

以下命令是当前 `PrestoClient` 已经暴露且插件可以通过 `requiredCapabilities` 声明访问的公共能力面。

### system 域

- `presto.system.health()`
  - 用途：读取后端健康状态与当前 active DAW。
  - 适用：诊断、启动前探测。

### config 域

- `presto.config.get()`
  - 用途：读取应用配置。
- `presto.config.update(request)`
  - 用途：更新应用配置。

### daw 域

- `presto.daw.connection.connect(request?)`
  - 用途：连接 DAW。
- `presto.daw.connection.disconnect()`
  - 用途：断开 DAW。
- `presto.daw.connection.getStatus()`
  - 用途：读取 DAW 连接状态。
- `presto.daw.adapter.getSnapshot()`
  - 用途：读取当前 DAW 适配器能力快照。

关键参数与返回：

- `connect({ host?, port?, timeoutSeconds? })`
- `getStatus() -> { connected, targetDaw, host?, port? }`
- `getSnapshot() -> { targetDaw, adapterVersion, hostVersion, modules, capabilities }`

这里最关键的边界是：

- 插件拿到的是 `daw.adapter.getSnapshot()` 这类能力级接口
- 插件拿不到宿主内部的 `ProToolsDawAdapter` 实例
- 插件也不能直接调用 py-ptsl 或宿主私有 DAW adapter 方法

### automation 域

- `presto.automation.splitStereoToMono.execute(request?)`
  - 用途：执行当前已经暴露为公共能力的立体声拆单声道自动化。

关键参数：

- `keepChannel?: "left" | "right"`

这里也要明确：

- 当前对插件公开的是特定自动化 capability
- 不是“任意 Pro Tools 自动化脚本执行接口”

### session 域

- `presto.session.getInfo()`
- `presto.session.getLength()`
- `presto.session.save()`
- `presto.session.applySnapshot(request)`
- `presto.session.getSnapshotInfo(request)`

用途：

- 读取 session 元数据
- 保存 session
- 应用 snapshot
- 查询 snapshot 信息

关键参数：

- `applySnapshot({ snapshot })`
- `getSnapshotInfo({ snapshot })`

其中 `snapshot` 结构为：

- `name: string`
- `trackStates: Array<{ trackName: string; isMuted: boolean; isSoloed: boolean }>`

### track 域

- `presto.track.list()`
- `presto.track.listNames()`
- `presto.track.selection.get()`
- `presto.track.rename(request)`
- `presto.track.select(request)`
- `presto.track.color.apply(request)`
- `presto.track.pan.set(request)`
- `presto.track.mute.set(request)`
- `presto.track.solo.set(request)`

这些能力是当前插件最直接可用的 Pro Tools 轨道级能力面。

关键参数：

- `rename({ currentName, newName })`
- `select({ trackName })`
- `color.apply({ trackName, colorSlot })`
- `pan.set({ trackName, value })`
- `mute.set({ trackNames, enabled })`
- `solo.set({ trackNames, enabled })`

### clip 域

- `presto.clip.selectAllOnTrack(request)`

关键参数：

- `selectAllOnTrack({ trackName })`

### transport 域

- `presto.transport.play()`
- `presto.transport.stop()`
- `presto.transport.record()`
- `presto.transport.getStatus()`

### import 域

- `presto.import.run.start(request)`

关键参数：

- `folderPaths: string[]`
- `orderedFilePaths?: string[]`
- `host?: string`
- `port?: number`
- `timeoutSeconds?: number`

### stripSilence 域

- `presto.stripSilence.open()`
- `presto.stripSilence.execute(request)`

关键参数：

- `execute({ trackName, profile })`
- `profile = { thresholdDb, minStripMs, minSilenceMs, startPadMs, endPadMs }`

### export 域

- `presto.export.range.set(request)`
- `presto.export.start(request)`
- `presto.export.direct.start(request)`
- `presto.export.mixSource.list(request)`
- `presto.export.run.start(request)`

关键参数：

- `range.set({ inTime, outTime })`
- `start()` / `direct.start()`
  - `outputPath`
  - `fileName`
  - `fileType`
  - `offline?`
  - `audio?`
  - `source?`
  - `video?`
  - `importAfterBounce?`
- `mixSource.list({ sourceType })`
- `run.start({ snapshots, exportSettings?, startTime?, endTime?, host?, port?, timeoutSeconds? })`

### jobs 域

- `presto.jobs.create(request)`
- `presto.jobs.update(request)`
- `presto.jobs.get(jobId)`
- `presto.jobs.list(filter?)`
- `presto.jobs.cancel(jobId)`
- `presto.jobs.delete(jobId)`

jobs 域的意义是：

- 对长流程能力进行统一观察和控制
- 插件不必自己重复发明一套任务状态模型

关键参数：

- `get(jobId)`
- `list({ states?, capabilities?, limit? })`
- `cancel(jobId)`
- `delete(jobId)`

## 6.2 当前插件可调用的 Runtime 服务命令总表

以下命令属于 `runtime` 客户端，前提是插件 manifest 已正确声明 `requiredRuntimeServices`。

### dialog

- `runtime.dialog.openFolder()`
  - 用途：打开目录选择器。
  - 返回：`{ canceled, paths }`

### shell

- `runtime.shell.openPath(path)`
  - 用途：请求宿主打开本地路径。
- `runtime.shell.openExternal(url)`
  - 用途：请求宿主打开外部链接。
  - 返回：`openPath -> string`，`openExternal -> boolean`

### fs

- `runtime.fs.readFile(path)`
- `runtime.fs.getHomePath()`
- `runtime.fs.writeFile(path, content)`
- `runtime.fs.ensureDir(path)`
- `runtime.fs.readdir(path)`
- `runtime.fs.stat(path)`

这组服务的边界是：

- 插件使用的是宿主代理后的文件系统服务
- 不是直接拿到 Node.js `fs` 的无限权限实例
- `stat(path)` 当前返回 `{ isFile, isDirectory } | null`

### mobileProgress

- `runtime.mobileProgress.createSession(taskId)`
- `runtime.mobileProgress.closeSession(sessionId)`
- `runtime.mobileProgress.getViewUrl(sessionId)`
- `runtime.mobileProgress.updateSession(sessionId, payload)`

用途：

- 为长任务生成移动进度查看会话
- 获取二维码或 URL
- 推送任务进度

关键返回：

- `createSession() -> { ok, sessionId?, url?, qrSvg?, error? }`
- `getViewUrl() -> { ok, sessionId?, url?, qrSvg?, error? }`
- `updateSession() -> { ok, sessionId?, updatedAt?, error? }`

### macAccessibility

- `runtime.macAccessibility.preflight()`
- `runtime.macAccessibility.runScript(script, args?)`
- `runtime.macAccessibility.runFile(path, args?)`

这是当前外部插件能直接触达 macOS 辅助功能能力的唯一正式入口。

它的边界必须写清楚：

- 插件可以请求宿主执行辅助功能脚本
- 插件不能直接拿到宿主内部的 `macAccessibilityRuntime` 私有对象
- 插件也不能直接调用后端内部 `mac_automation` 对象

关键返回：

- `preflight() -> { ok, trusted, error? }`
- `runScript()` / `runFile() -> { ok, stdout, stderr?, error? }`

## 6.3 当前类型存在但第三方插件不要依赖的 Runtime 项

`PluginRuntime` 类型当前还定义了：

- `automation.listDefinitions()`
- `automation.runDefinition(request)`

但按照当前实现事实，第三方插件不应依赖这两个接口，原因有两层：

1. 当前插件权限校验允许列表未把这两个 runtime service 纳入稳定白名单
2. 当前 `guardRuntimeAccess()` 也没有为插件装配 `runtime.automation`

因此，文档上必须把这类项明确标成：

- 类型中出现
- 当前第三方插件不要使用
- 不能作为“已经支持”的外部接入能力来写

## 6.4 当前与 Pro Tools 相关的可调用边界

外部接入者最容易误解的一点是：看到代码里有 `ProToolsDawAdapter`，就以为插件可以直接操作 adapter。

当前正确边界如下：

- 插件可以通过 `presto.*` 调用公开 capability
- 这些 capability 的底层当前多数会落到 Pro Tools 适配器
- 插件不能直接 import 或调用 `backend/presto/integrations/daw/protools_adapter.py`
- 插件不能直接调用 py-ptsl

对外文档中的正确表述应是：

- “当前宿主通过公开 capability 向插件暴露 Pro Tools 相关能力”
- 不是“向插件暴露 Pro Tools adapter 对象”

## 6.5 当前与 mac 辅助功能相关的可调用边界

这里也必须区分两层：

### 插件当前可直接调用

- `runtime.macAccessibility.preflight()`
- `runtime.macAccessibility.runScript(script, args?)`
- `runtime.macAccessibility.runFile(path, args?)`

### 插件当前不可直接调用

- 后端内部 `mac.preflightAccessibility` internal capability
- `create_default_mac_automation_engine()` 构建出的内部自动化引擎
- 宿主私有无障碍 runtime 细节

文档应明确说明：

- 对外开放的是 Runtime 服务接口
- 不是内部自动化引擎对象

## 6.6 Capability 调用示例

### 示例 1：检查 DAW 连接状态

```ts
const status = await context.presto.daw.connection.getStatus()

if (!status.connected) {
  await context.presto.daw.connection.connect({
    host: '127.0.0.1',
    port: 31416,
    timeoutSeconds: 5,
  })
}
```

### 示例 2：重命名轨道并设置颜色

```ts
await context.presto.track.rename({
  currentName: 'Audio 1',
  newName: 'LeadVox_Main',
})

await context.presto.track.color.apply({
  trackName: 'LeadVox_Main',
  colorSlot: 23,
})
```

### 示例 3：启动导入流程并轮询任务

```ts
const started = await context.presto.import.run.start({
  folderPaths: ['/Users/me/Desktop/import-audio'],
})

const job = await context.presto.jobs.get(started.jobId)
context.logger.info('import job state', { state: job.state })
```

### 示例 4：设置导出区间并启动批量导出

```ts
await context.presto.export.range.set({
  inTime: '00:00:10:00',
  outTime: '00:00:42:00',
})

await context.presto.export.run.start({
  snapshots: [
    {
      name: 'LeadVox',
      trackStates: [{ trackName: 'LeadVox_Main', isMuted: false, isSoloed: true }],
    },
  ],
  exportSettings: {
    outputPath: '/Users/me/Desktop/bounces',
    filePrefix: 'Mix_',
    fileFormat: 'wav',
    mixSourceName: 'Out 1-2',
    mixSourceType: 'output',
    onlineExport: false,
  },
})
```

## 6.7 Runtime 调用示例

### 示例 1：选择目录并读取文件

```ts
const picked = await context.runtime.dialog?.openFolder()
if (!picked || picked.canceled || picked.paths.length === 0) {
  return
}

const names = await context.runtime.fs?.readdir(picked.paths[0])
context.logger.info('picked files', { names })
```

### 示例 2：创建移动进度会话

```ts
const session = await context.runtime.mobileProgress?.createSession('export-job-1')
if (session?.ok) {
  context.logger.info('mobile progress url', { url: session.url })
}
```

### 示例 3：执行 mac 辅助功能脚本

```ts
const preflight = await context.runtime.macAccessibility?.preflight()
if (!preflight?.trusted) {
  throw new Error('mac accessibility permission not granted')
}

const result = await context.runtime.macAccessibility?.runScript(
  'on run argv\nreturn \"ok\"\nend run',
)

if (!result?.ok) {
  throw new Error(result?.error?.message ?? 'script failed')
}
```

## 6.8 常见失败语义

当前外部调用最常见的错误码包括：

- `DAW_NOT_CONNECTED`
- `NO_OPEN_SESSION`
- `PT_VERSION_UNSUPPORTED`
- `MAC_ACCESSIBILITY_DENIED`
- `UI_ELEMENT_NOT_FOUND`
- `VALIDATION_ERROR`
- `JOB_NOT_FOUND`
- `UNEXPECTED_ERROR`

建议处理方式：

- 参数错误：修正请求，不重试
- 权限错误：引导用户完成系统授权
- DAW 未连接：先走连接链路
- job 不存在：刷新本地任务状态，不盲目重试

## 7. 新增 capability 的正确路径

如果你要新增一个新的业务能力，应按以下顺序操作：

### 第一步：定义 contracts

至少要补齐：

- capability ID
- request type
- response type
- registry definition
- `PrestoClient` 对应 client interface

### 第二步：实现后端

需要补齐：

- handler 实现
- capability 分发接入
- schema / route 适配

### 第三步：扩展 `sdk-core`

需要补齐：

- 对应 domain client 方法
- `createPrestoClient` 装配

### 第四步：前端或插件接入

此时才能在宿主或插件中调用。

如果插件也需要访问，还必须同步补齐：

- manifest `requiredCapabilities`
- 权限守卫测试

## 8. 新增 runtime 服务的正确路径

如果你要新增宿主运行时服务，应按以下顺序操作：

1. 在 `contracts` 中扩展 `PluginRuntimeServiceName` 与对应 runtime 接口。
2. 在 `sdk-runtime` 中补齐 client 类型。
3. 在主进程 handler 中实现对应能力。
4. 在 `runtimeBridge.ts` 中映射为类型化 client。
5. 在 `guardRuntimeAccess.ts` 中补齐权限裁剪。
6. 若插件要用，再在 manifest 中声明 `requiredRuntimeServices`。

这条路径少一步都不算完成。

## 9. SDK 与插件开发的关系

Presto 的 SDK 不是独立于插件系统存在的。当前插件系统直接建立在 SDK 和 contracts 之上：

- 插件 manifest 依赖 contracts
- 插件 `PluginContext` 依赖 contracts
- 插件调用能力依赖 `PrestoClient`
- 插件访问宿主服务依赖 `PrestoRuntime`

所以，SDK 变更本质上会直接影响插件开发接口。

这要求内部开发者在变更 SDK 时必须把插件当成第一类使用方，而不是附属调用者。

## 10. 当前开发限制

文档必须明确当前 SDK 不是一套“独立发布到外部生态的完整产品化 SDK”。它当前更像项目内稳定协议层，具备以下特征：

- 类型完整度高于外部文档完整度
- 与当前宿主实现强关联
- 与 capability registry 强绑定
- 与插件权限系统强绑定

因此，对外接入文档必须基于当前实现事实，不应把 SDK 宣传为泛化平台 SDK。

## 11. 建议实践

### 对内部开发者

- 能力改动先改 `contracts`
- 不要直接在页面里拼 capability 字符串
- 不要绕过 `sdk-core` 直接手写 envelope

### 对插件作者

- 把 `presto` 视为业务能力面
- 把 `runtime` 视为宿主服务面
- 不要假设未声明的字段或能力可用

## 12. 一句话结论

Presto SDK 当前是一套围绕 `contracts` 建立的、以 capability 调用和 runtime 服务调用为中心的内部稳定协议层；对外接入时，应严格把它当作“受宿主权限约束的 SDK”，而不是自由访问的全功能平台 API。
