# Presto 插件开发规范与流程

本文档面向 Presto 插件开发者，描述当前代码已经成立的插件开发边界、目录结构、manifest 规则、模块导出要求、设置页接入方式，以及推荐开发流程。

这不是愿景文档，也不是兼容历史模型的迁移说明。本文档只描述 `0.3.0-alpha.2` 当前真实有效的插件协议。

## 1. 第一原则

当前 Presto 插件系统的基本原则只有四条：

1. 插件负责定义，不负责直接执行宿主或外部系统操作。
2. 插件只能通过 manifest 声明的 capability 访问正式能力面。
3. 插件拿到的是裁剪后的 `PluginContext`，不是宿主私有对象。
4. 插件不能直接控制外部 app，也不能直接访问宿主私有 runtime。

这意味着：

- 插件可以声明页面、设置页、命令、自动化入口和能力需求。
- 插件可以调用 `context.presto.*` 上的正式 capability。
- 插件不能使用 `context.runtime`。
- 插件不能声明 `requiredRuntimeServices`。
- 插件不能依赖 `shell.openPath`、`dialog.openFolder`、`fs.*`、`mobileProgress.*` 这类旧宿主直通接口。

如果一个需求本质上是在“让插件直接驱动宿主或外部应用”，那它不符合当前插件边界，应该先回到平台能力设计，而不是在插件里绕过边界。

## 2. 插件能做什么

当前插件系统支持两类扩展：

- `workflow`
- `automation`

插件可以向宿主提供：

- 工作区页面 `pages`
- 自动化入口 `automationItems`
- 设置页定义 `settingsPages`
- 侧边导航项 `navigationItems`
- 命令项 `commands`

这些都是“声明式接入”。宿主会读取 manifest、校验字段、加载模块、裁剪权限，再决定挂载什么内容。

## 3. 插件不能做什么

以下做法在当前系统里都不成立：

- 直接访问 `context.runtime`
- 在 manifest 中声明 `requiredRuntimeServices`
- 直接调用 Electron、Node 文件系统或系统 shell
- 直接控制 Pro Tools 等外部 app
- 假设宿主会把未声明的 capability 暴露给插件
- 把设置页做成宿主外的一套自定义配置系统

当前宿主会拒绝带有 `requiredRuntimeServices` 的插件 manifest。权限守卫也只会在 capability 被调用时，按声明粒度访问对应后端服务。

## 4. 最小目录结构

当前最小可识别结构：

```text
my-plugin/
├── manifest.json
└── dist/
    └── entry.mjs
```

常见扩展结构：

```text
my-plugin/
├── manifest.json
└── dist/
    ├── entry.mjs
    └── style.css
```

字段含义：

- `manifest.json`：插件声明入口
- `dist/entry.mjs`：插件模块入口
- `styleEntry`：可选样式资源，由宿主按 manifest 路径加载

## 5. PluginContext 真实边界

当前插件运行时上下文定义如下：

```ts
export interface PluginContext {
  pluginId: string
  locale: PluginLocaleContext
  presto: PrestoClient
  storage: PluginStorage
  logger: PluginLogger
}
```

这意味着插件当前正式可依赖的运行时面只有：

- `pluginId`
- `locale`
- `presto`
- `storage`
- `logger`

这里没有 `runtime`。如果你的插件设计依赖 `context.runtime`，那就是基于旧模型，当前不能接入。

## 6. manifest 规范

### 6.1 必填核心字段

- `pluginId`
- `extensionType`
- `version`
- `hostApiVersion`
- `supportedDaws`
- `uiRuntime`
- `displayName`
- `entry`
- `pages` 或 `automationItems`
- `requiredCapabilities`

其中：

- `extensionType` 只能是 `workflow` 或 `automation`
- `uiRuntime` 当前必须是 `react18`
- `supportedDaws` 当前实际应写 `["pro_tools"]`

### 6.2 权限与兼容字段

- `requiredCapabilities`
- `adapterModuleRequirements`
- `capabilityRequirements`

规则：

- `requiredCapabilities` 是插件真正要调用的能力声明
- `adapterModuleRequirements` 用于声明目标 DAW 适配模块最低版本
- `capabilityRequirements` 用于声明 capability 最低版本

不允许出现的字段：

- `requiredRuntimeServices`

### 6.3 workflow 插件要求

`workflow` 插件至少需要一项 `pages`。

### 6.4 automation 插件要求

`automation` 插件至少需要一项 `automationItems`。

### 6.5 最小 workflow manifest 示例

```json
{
  "pluginId": "thirdparty.example-workflow",
  "extensionType": "workflow",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": ["pro_tools"],
  "uiRuntime": "react18",
  "displayName": "Example Workflow",
  "description": "Example workflow plugin for Presto.",
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
    "jobs.get"
  ],
  "adapterModuleRequirements": [
    { "moduleId": "daw", "minVersion": "2025.10.0" },
    { "moduleId": "track", "minVersion": "2025.10.0" },
    { "moduleId": "jobs", "minVersion": "2025.10.0" }
  ],
  "capabilityRequirements": [
    { "capabilityId": "daw.connection.getStatus", "minVersion": "2025.10.0" },
    { "capabilityId": "track.list", "minVersion": "2025.10.0" },
    { "capabilityId": "jobs.get", "minVersion": "2025.10.0" }
  ]
}
```

## 7. 入口模块规范

插件入口模块必须符合 `WorkflowPluginModule`：

```ts
export interface WorkflowPluginModule {
  manifest: WorkflowPluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
```

当前最低要求：

- 导出 `manifest`
- 导出 `activate(context)`

常见错误：

- 只导出页面组件，不导出 `manifest`
- `activate` 不是函数
- `manifest` 与 `manifest.json` 语义不一致
- 在 `activate()` 里访问未声明 capability

## 8. 设置页规范

插件设置页不是任意 UI 页面，而是宿主统一渲染的结构化设置模型。

设置页通过 `settingsPages` 声明，字段包括：

- `pageId`
- `title`
- `order`
- `storageKey`
- `defaults`
- `loadExport`
- `saveExport`
- `sections`

字段类型由 `packages/contracts/src/plugins/settings.ts` 定义，当前支持：

- `toggle`
- `select`
- `text`
- `password`
- `textarea`
- `number`
- `categoryList`

这意味着：

- 你定义的是设置结构，不是自己渲染整个设置壳层
- 设置存储由宿主按 `pluginId` 做命名空间隔离
- 加载与保存逻辑由插件导出的 `loadExport` / `saveExport` 承接

## 9. capability 使用规范

插件所有业务动作都必须走 `context.presto.*`。

例如：

- `context.presto.daw.connection.getStatus()`
- `context.presto.track.list()`
- `context.presto.import.run.start(request)`
- `context.presto.jobs.get(jobId)`

规范要求：

1. manifest 中声明 `requiredCapabilities`
2. 如需版本约束，再声明 `capabilityRequirements`
3. 在插件代码中只调用已声明能力

权限守卫是运行时真实生效的，不是文档约定。未声明的 capability 调用会直接失败。

## 10. 开发流程

推荐按以下顺序开发插件。

### 第一步：先定义插件类型

先确定你做的是：

- workflow 插件
- automation 插件

不要在一个插件里混杂两套不清晰的职责。

### 第二步：先写 manifest，再写页面

先把这些内容定清楚：

- `pluginId`
- `extensionType`
- 页面或自动化入口
- `requiredCapabilities`
- 版本约束

不要先写页面，再倒推 manifest。当前宿主是 manifest 驱动的。

### 第三步：按 capability 反推执行动作

把插件中的每个执行动作都映射到正式 capability：

- 需要读取 DAW 状态，用哪个 capability
- 需要发起导入或导出，用哪个 capability
- 需要追踪异步任务，用哪个 `jobs.*`

如果找不到对应 capability，不要在插件里自行打开系统能力或外部 app。应该先补平台能力。

### 第四步：实现入口模块

完成：

- `manifest` 导出
- `activate(context)`
- 页面组件导出
- 设置页 load/save 导出

### 第五步：本地装载验证

至少验证：

- manifest 能被发现
- 权限校验通过
- 模块能导入
- `activate()` 不报错
- workflow 页面能出现在宿主
- settings 页面能正常读写

## 11. 宿主实际加载流程

当前宿主加载插件的大致路径是：

1. 扫描插件根目录
2. 读取 `manifest.json`
3. 校验 manifest 结构
4. 校验权限字段
5. 校验 DAW 支持范围
6. 动态导入入口模块
7. 创建裁剪后的 `PluginContext`
8. 调用 `activate(context)`
9. 挂载页面、设置页、命令、自动化入口

因此，插件“装进去但不可见”通常只会是这几类问题：

- manifest 字段不合法
- `requiredCapabilities` 含未支持项
- 使用了已被禁止的 `requiredRuntimeServices`
- 入口模块导出不完整
- `activate()` 里调用了未声明 capability

## 12. 插件开发检查清单

在提交插件前，至少自检以下项目。

### 结构

- 存在 `manifest.json`
- 存在 `dist/entry.mjs`
- `entry` 路径与实际产物一致

### manifest

- `pluginId` 唯一且稳定
- `extensionType` 正确
- `supportedDaws` 为 `["pro_tools"]`
- `uiRuntime` 为 `react18`
- 不含 `requiredRuntimeServices`
- `requiredCapabilities` 无重复、无未支持项

### 运行时

- `activate()` 可正常执行
- 不访问 `context.runtime`
- 不直接调用宿主私有桥或外部 app

### 设置页

- `settingsPages` 字段完整
- `loadExport` 和 `saveExport` 都有对应导出
- `defaults` 为对象
- `sections` / `fields` 使用正式字段类型

## 13. 当前推荐实践

- 一个插件只解决一个清晰工作流问题
- 先最小化 `requiredCapabilities`，不要一次性声明整批能力
- 把“执行”理解成 capability 调用，而不是宿主直通调用
- 把“插件设置”理解成宿主统一渲染的数据模型，而不是自带设置系统
- 把“兼容性”理解成 `hostApiVersion`、模块版本与 capability 版本约束，而不是运行时兜底

## 14. 当前不应再参考的旧模型

如果你在旧文档、旧插件副本或历史讨论中看到以下写法，都不应再沿用：

- `context.runtime.*`
- `requiredRuntimeServices`
- 插件直接打开文件夹、直接读写本地文件、直接开系统链接
- 插件直接控制 Pro Tools 或其他外部 app

当前正确模型是：

- 插件声明 capability
- 宿主按 manifest 裁剪上下文
- 插件调用 `context.presto.*`
- 真正执行由后端能力层或宿主正式能力承接

## 15. 相关文档

- `README.md`
- `docs/version-support.md`
- `docs/sdk-development.md`
- `docs/frontend-architecture.md`
- `docs/backend-architecture.md`

如果你要新增平台能力，而不是只是消费现有 capability，请先读架构文档，再改插件。
