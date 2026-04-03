# Presto SDK 开发

本文档面向需要接入或扩展 Presto SDK 的开发者，说明当前 SDK 的组成、职责边界、调用模型，以及新增 capability 的正确路径。

本文档只描述 `0.3.0-alpha.2` 当前真实有效的 SDK 结构，不保留旧插件 runtime 模型的历史兼容说法。

## 1. 先分清三种东西

在当前 Presto 里，最容易混淆的是以下三类对象：

1. capability 调用
2. 宿主内部 runtime
3. plugin manifest `commands`

### 1.1 capability 调用

这是宿主和插件通过 `presto` 客户端调用的正式业务能力，例如：

- `presto.daw.connection.getStatus()`
- `presto.track.rename(request)`
- `presto.export.run.start(request)`

这类调用最终会进入后端 capability invoke 链路。

### 1.2 宿主内部 runtime

这是 Electron 宿主内部使用的运行时服务面，例如窗口、系统桥、对话框、文件系统代理等。

它当前仍是宿主实现的一部分，但对插件不构成正式开放的 SDK 面。插件当前拿不到 `context.runtime`，也不能通过 manifest 声明 runtime 权限。

所以：

- `sdk-runtime` 仍然存在
- 它服务于宿主装配
- 它不是当前第三方插件可依赖的正式接入面

### 1.3 plugin manifest `commands`

这是插件在 manifest 中声明给宿主 UI 展示的命令入口，例如“打开某个页面”。

它不是 capability，也不是执行权限通道。

## 2. SDK 当前分层

当前 SDK 相关代码主要分三层：

1. `packages/contracts`
2. `packages/sdk-core`
3. `packages/sdk-runtime`

### 2.1 `packages/contracts`

作用：

- 定义 capability ID
- 定义 request / response 类型
- 定义插件 manifest
- 定义 `PluginContext`
- 定义错误与事件模型

这里定义的是协议面和类型面。

当前插件最关键的真实边界就在这里：

- `PluginContext` 只有 `pluginId`、`locale`、`presto`、`storage`、`logger`
- `WorkflowPluginManifest` 只有 `requiredCapabilities`
- manifest 不存在 `requiredRuntimeServices`

### 2.2 `packages/contracts-manifest`

作用：

- 定义 capability 事实源
- 生成 TypeScript 与 Python 共用产物

当前它是 capability 清单和相关生成产物的上游来源之一，但不再承担插件 runtime 权限清单的正式事实源职责。

### 2.3 `packages/sdk-core`

作用：

- 以 capability 为中心装配 `PrestoClient`
- 把 capability invoke 统一封装成领域 client

当前主要领域包括：

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

### 2.4 `packages/sdk-runtime`

作用：

- 组织宿主内部 runtime client
- 供 Electron 宿主装配与 renderer bridge 使用

这层当前不是插件正式能力面。

如果你的目标是写插件，就不应该把 `sdk-runtime` 当成当前开放 SDK 来依赖。

## 3. 当前最重要的边界

### 3.1 对宿主开发者

宿主代码里仍然区分两类调用：

- capability 调用：走 `sdk-core`
- 宿主 runtime：走 `sdk-runtime`

### 3.2 对插件开发者

插件当前只有一条正式执行路径：

- 通过 `context.presto.*` 调 capability

插件不能：

- 使用 `context.runtime`
- 声明 `requiredRuntimeServices`
- 直接控制外部 app
- 直接访问宿主私有对象

这条边界不是文档约定，而是当前实现事实。

## 4. `sdk-core` 的装配模型

`packages/sdk-core` 的核心职责是把 capability invoke 封装成统一 `PrestoClient`。

当前设计要点：

1. 依赖抽象 transport，而不是直接依赖 HTTP 或 IPC
2. 统一生成 request envelope
3. 统一处理 response envelope
4. 按领域返回类型化 client

这意味着：

- renderer 和宿主不需要自己拼 capability 请求
- 错误处理可以集中
- transport 可以替换

### 4.1 当前错误语义

当前 capability 调用失败时，会走异常路径，而不是让上层自己手动判断 success flag。

因此，SDK 使用方应把能力失败当作异常来处理。

## 5. 插件实际看到的 SDK 面

当前插件拿到的是裁剪后的 `PluginContext`：

```ts
export interface PluginContext {
  pluginId: string
  locale: PluginLocaleContext
  presto: PrestoClient
  storage: PluginStorage
  logger: PluginLogger
}
```

这意味着插件正式可依赖的 SDK 面只有：

- `presto`
- `storage`
- `logger`
- `locale`

这里没有 `runtime`。

所以当前插件开发时，不应该再问“哪些 runtime service 可以声明”，而应该问：

- 我需要的动作是否已经有正式 capability
- 我的插件是否已在 manifest 中声明该 capability

## 6. 当前插件可调用的 capability 范围

以下是当前插件体系里已经接入的主要 capability 域。

### 6.1 system

- `presto.system.health()`

用途：

- 健康检查
- 读取当前 active DAW

### 6.2 config

- `presto.config.get()`
- `presto.config.update(request)`

### 6.3 daw

- `presto.daw.connection.connect(request?)`
- `presto.daw.connection.disconnect()`
- `presto.daw.connection.getStatus()`
- `presto.daw.adapter.getSnapshot()`

这里最重要的边界是：

- 插件拿到的是 capability 级接口
- 插件拿不到宿主内部 DAW adapter 对象
- 插件不能直接调用 py-ptsl 或宿主私有适配器实现

### 6.4 automation

- `presto.automation.splitStereoToMono.execute(request?)`

这不是“任意自动化脚本执行入口”，而是已经正式公开的特定 capability。

### 6.5 session

- `presto.session.getInfo()`
- `presto.session.getLength()`
- `presto.session.save()`
- `presto.session.applySnapshot(request)`
- `presto.session.getSnapshotInfo(request)`

### 6.6 track

- `presto.track.list()`
- `presto.track.listNames()`
- `presto.track.selection.get()`
- `presto.track.rename(request)`
- `presto.track.select(request)`
- `presto.track.color.apply(request)`
- `presto.track.pan.set(request)`
- `presto.track.mute.set(request)`
- `presto.track.solo.set(request)`

### 6.7 clip

- `presto.clip.selectAllOnTrack(request)`

### 6.8 transport

- `presto.transport.play()`
- `presto.transport.stop()`
- `presto.transport.record()`
- `presto.transport.getStatus()`

### 6.9 import

- `presto.import.analyze(request)`
- `presto.import.cache.save(request)`
- `presto.import.run.start(request)`

### 6.10 stripSilence

- `presto.stripSilence.open()`
- `presto.stripSilence.execute(request)`

### 6.11 export

- `presto.export.range.set(request)`
- `presto.export.start(request)`
- `presto.export.direct.start(request)`
- `presto.export.mixSource.list(request)`
- `presto.export.run.start(request)`

### 6.12 jobs

- `presto.jobs.create(request)`
- `presto.jobs.update(request)`
- `presto.jobs.get(jobId)`
- `presto.jobs.list(filter?)`
- `presto.jobs.cancel(jobId)`
- `presto.jobs.delete(jobId)`

`jobs` 域的意义是统一长流程状态，而不是让每个插件自己发明一套任务模型。

## 7. capability 调用示例

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

### 示例 3：分析导入目录并启动导入任务

```ts
const analyzed = await context.presto.import.analyze({
  folderPaths: ['/Users/me/Desktop/import-audio'],
  categories: [],
})

await context.presto.import.cache.save({
  folderPath: '/Users/me/Desktop/import-audio',
  payload: analyzed,
})

const started = await context.presto.import.run.start({
  folderPaths: ['/Users/me/Desktop/import-audio'],
})
```

### 示例 4：启动导出并轮询任务

```ts
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

## 8. 新增 capability 的正确路径

如果要新增一个正式 capability，顺序必须是：

1. 先定义 `contracts`
2. 再更新 `contracts-manifest` 与生成产物
3. 再实现后端 handler
4. 再扩展 `sdk-core`
5. 最后才让宿主或插件接入

具体来说，至少要补齐：

- capability ID
- request / response 类型
- registry 定义
- `PrestoClient` 对应领域接口
- 后端 handler 与分发
- `sdk-core` client 装配

如果插件也要访问，还必须继续补齐：

- manifest `requiredCapabilities`
- `capabilityRequirements`（如需版本约束）
- 权限守卫测试

## 9. 不要再走的旧路径

以下做法在当前插件模型中都不应再作为正式路径写入设计或文档：

- 给插件新增 `runtime` 直通能力
- 在插件 manifest 中声明 `requiredRuntimeServices`
- 让插件直接打开系统目录或直接读写宿主文件系统
- 让插件直接控制 Pro Tools 或其他外部 app

如果一个需求确实需要新的执行能力，应把它设计成新的 capability，而不是把宿主私有 runtime 重新暴露给插件。

## 10. SDK 与插件的关系

当前 SDK 与插件关系可以概括为：

- 插件 manifest 依赖 `contracts`
- 插件 `PluginContext` 依赖 `contracts`
- 插件业务动作依赖 `PrestoClient`
- 插件不依赖 `PrestoRuntime`

因此，SDK 变更若影响 capability 契约，就会直接影响插件开发接口。

这要求内部开发者在修改 SDK 时，必须把插件当成第一类使用方。

## 11. 建议实践

### 对内部开发者

- 能力改动先改 `contracts`
- 不要在页面里手拼 capability 字符串
- 不要绕过 `sdk-core` 自己拼 invoke envelope
- 不要把宿主 runtime 误写成插件正式能力

### 对插件作者

- 把 `presto` 视为唯一正式执行面
- 把 manifest 声明视为真实权限边界
- 把“插件只负责定义，执行由后端与宿主正式能力承接”当作基本前提
- 如果缺 capability，先补平台能力，不要在插件里绕过

## 12. 一句话结论

Presto SDK 当前是一套围绕 `contracts` 和 capability 契约建立的稳定协议层。对插件来说，当前正式可依赖的只有受权限裁剪的 `PrestoClient`，而不是宿主 runtime 直通接口。
