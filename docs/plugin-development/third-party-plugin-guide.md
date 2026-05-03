# 第三方插件开发完整指南

本文档面向仓库外的插件开发者，也面向需要把内部插件整理成可安装包的维护者。它只描述当前代码已经成立的插件协议，不把路线图、历史 Electron/sidecar 方案或宿主私有 runtime 当成公开能力。

如果只读一份第三方插件文档，应先读这一份；需要更细的领域规则时，再跳到专项规范。

## 1. 当前插件平台的基本边界

Presto 插件不是“任意脚本放进宿主执行”的模型。

当前插件的正式边界由三部分组成：

1. `manifest.json`
   - 声明插件类型、入口、页面、能力、权限、资源和版本要求。
2. `dist/entry.mjs`
   - 导出 manifest、激活函数、页面组件、settings 函数、automation runner 或 tool runner。
3. 宿主注入的受限上下文
   - `activate(context)` 只能使用 `PluginContext`。
   - 页面组件额外收到受限 `host`。
   - tool runner 额外收到 runner 上下文。
   - automation runner 额外收到 automation runner 上下文。

插件不能依赖这些东西：

- `context.runtime`
- `requiredRuntimeServices`
- 宿主内部 `sdk-runtime`
- Node `fs` / `child_process`
- Tauri command 名称
- 后端本地 HTTP 地址
- 旧 Electron preload 或 Node sidecar

正式业务能力必须通过 `context.presto.*` capability client，或通过宿主明确开放的 tool/automation runner host。

## 2. 选择插件类型

当前只支持三类插件：

| 类型 | `extensionType` | 适用场景 | 页面挂载 | 是否依赖 DAW |
| --- | --- | --- | --- | --- |
| Workflow | `workflow` | 多步骤流程、输入预览、settings、job 进度、capability 编排 | `workspace` | 当前写 `["pro_tools"]` |
| Automation | `automation` | 宿主已识别的自动化卡片入口，执行链很短 | 当前官方标准无插件页面 | 当前写 `["pro_tools"]` |
| Tool | `tool` | 独立工具页、文件处理、本地 bundled resource、纯计算工具 | `tools` | 必须写 `[]` |

判断规则：

- 需要工作区页面、复杂输入、settings、workflow definition、jobs 追踪：做 `workflow`。
- 只是向宿主自动化页注册一个已支持的卡片入口：做 `automation`。
- 不依赖 DAW 连接，属于独立处理工具或纯计算工具：做 `tool`。
- 如果 automation 开始需要页面、settings、条件分支、批处理或 job 追踪，应改成 workflow。
- 如果 tool 开始依赖 DAW session/track/import/export capability，应重新判断它是不是 workflow。

## 3. 最小目录结构

### 3.1 Workflow 插件

```text
my-workflow-plugin/
├── manifest.json
└── dist/
    ├── entry.mjs
    ├── MyWorkflowPage.mjs
    ├── workflowCore.mjs
    ├── workflow-definition.json
    └── style.css
```

### 3.2 Automation 插件

```text
my-automation-plugin/
├── manifest.json
└── dist/
    └── entry.mjs
```

### 3.3 Tool 插件：纯前端工具页

```text
my-tool-plugin/
├── manifest.json
└── dist/
    ├── entry.mjs
    ├── MyToolPage.mjs
    ├── toolCore.mjs
    └── style.css
```

### 3.4 Tool 插件：带 bundled process

```text
my-bundled-tool-plugin/
├── manifest.json
├── dist/
│   ├── entry.mjs
│   ├── MyToolPage.mjs
│   ├── toolCore.mjs
│   └── style.css
└── resources/
    ├── scripts/
    │   └── run_tool.sh
    └── bin/
        └── helper-binary
```

所有 manifest 引用路径都必须是插件根目录内的相对路径。插件目录树不能包含 symbolic link。

## 4. Manifest 完整字段参考

当前 manifest 类型是 `PluginManifest`，公开定义在 `@presto/contracts/plugins/manifest`。

### 4.1 共享必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `pluginId` | string | 全局唯一插件 ID。建议使用反域名或组织前缀，例如 `com.example.import-helper`。 |
| `extensionType` | `"workflow"` / `"automation"` / `"tool"` | 插件类型。 |
| `version` | string | 插件自身版本。 |
| `hostApiVersion` | string | 宿主插件 API 版本要求。当前校验接受 `0.1.0`、`1`、`1.0.0`。官方插件当前使用 `0.1.0`。 |
| `supportedDaws` | string[] | 当前 workflow/automation 写 `["pro_tools"]`；tool 必须写 `[]`。`logic`、`cubase`、`nuendo` 只是类型预留，不是当前可用目标。 |
| `uiRuntime` | `"react18"` | 当前只能写 `react18`。 |
| `displayName` | string | 宿主 UI 展示名。 |
| `entry` | string | 入口模块相对路径，例如 `dist/entry.mjs`。 |
| `pages` | array | 页面声明。即使没有页面也要写 `[]`。 |
| `requiredCapabilities` | string[] | 插件会调用的正式 capability ID。没有 capability 调用时写 `[]`。 |

### 4.2 共享可选字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `description` | string | 插件说明。 |
| `styleEntry` | string | 插件 CSS 相对路径。 |
| `automationItems` | array | automation 插件入口声明。 |
| `tools` | array | tool runner 声明。纯前端 tool 可以不声明。 |
| `settingsPages` | array | workflow settings 结构化声明。 |
| `workflowDefinition` | object | workflow 编排入口引用。workflow 插件必填。 |
| `toolRuntimePermissions` | string[] | tool 页面和 runner 能力权限。 |
| `bundledResources` | array | tool runner 可执行的内置脚本或二进制资源。 |
| `adapterModuleRequirements` | array | 对宿主/后端模块最低版本的声明。 |
| `capabilityRequirements` | array | 对单个 capability 最低版本的声明。 |

## 5. Manifest 按类型的硬性规则

### 5.1 Workflow

Workflow 插件必须满足：

- `extensionType: "workflow"`
- `supportedDaws: ["pro_tools"]`
- `pages` 至少包含一个 `mount: "workspace"` 的页面
- `workflowDefinition` 必填
- `workflowDefinition.definitionEntry` 指向真实 JSON 文件
- workflow definition 中每个 `usesCapability` 都必须出现在 `requiredCapabilities`
- 如声明 `settingsPages`，对应 `loadExport` / `saveExport` 必须在入口模块导出

最小 manifest 示例：

```json
{
  "pluginId": "com.example.simple-workflow",
  "extensionType": "workflow",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": ["pro_tools"],
  "uiRuntime": "react18",
  "displayName": "Simple Workflow",
  "description": "Run a small Pro Tools workflow.",
  "entry": "dist/entry.mjs",
  "styleEntry": "dist/style.css",
  "workflowDefinition": {
    "workflowId": "com.example.simple-workflow.run",
    "inputSchemaId": "com.example.simple-workflow.run.v1",
    "definitionEntry": "dist/workflow-definition.json"
  },
  "pages": [
    {
      "pageId": "simple-workflow.page.main",
      "path": "/plugins/simple-workflow",
      "title": "Simple Workflow",
      "mount": "workspace",
      "componentExport": "SimpleWorkflowPage"
    }
  ],
  "requiredCapabilities": ["workflow.run.start", "jobs.get"]
}
```

### 5.2 Automation

Automation 插件必须满足：

- `extensionType: "automation"`
- `supportedDaws: ["pro_tools"]`
- `pages: []`
- `automationItems` 存在且非空
- `automationItems[*].itemId` 唯一
- `automationItems[*].automationType` 是宿主已经识别的类型
- `automationItems[*].runnerExport` 在入口模块导出
- `requiredCapabilities` 覆盖 runner 实际调用

当前官方已识别的 automation 参考包括：

- `splitStereoToMono`
- `batchAraBackupRender`

最小 manifest 示例：

```json
{
  "pluginId": "com.example.selection-automation",
  "extensionType": "automation",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": ["pro_tools"],
  "uiRuntime": "react18",
  "displayName": "Selection Automation",
  "entry": "dist/entry.mjs",
  "pages": [],
  "automationItems": [
    {
      "itemId": "selection-automation.card",
      "title": "Selection Automation",
      "automationType": "splitStereoToMono",
      "description": "Run the host-supported split stereo to mono automation.",
      "order": 10,
      "runnerExport": "runSelectionAutomation",
      "optionsSchema": [
        {
          "optionId": "keepChannel",
          "kind": "select",
          "label": "Keep Channel",
          "defaultValue": "left",
          "options": [
            { "value": "left", "label": "Left" },
            { "value": "right", "label": "Right" }
          ]
        }
      ]
    }
  ],
  "requiredCapabilities": ["daw.automation.splitStereoToMono.execute"],
  "adapterModuleRequirements": [
    { "moduleId": "automation", "minVersion": "2025.10.0" }
  ]
}
```

`automationType` 不是 capability ID。capability ID 放在 `requiredCapabilities`，由 runner 或宿主卡片执行时使用。

### 5.3 Tool

Tool 插件必须满足：

- `extensionType: "tool"`
- `supportedDaws: []`
- 所有页面 `mount` 都必须是 `tools`
- 如果声明 `tools[]`，每个 tool 至少包含 `toolId`、`pageId`、`title`、`runnerExport`
- 如果页面或 runner 使用 host 文件/对话框/shell/bundled process，必须声明对应 `toolRuntimePermissions`
- 如果 runner 调用 `process.execBundled(...)`，必须同时声明 `process.execBundled` 权限和对应 `bundledResources`

纯前端 tool 最小 manifest：

```json
{
  "pluginId": "com.example.time-tool",
  "extensionType": "tool",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": [],
  "uiRuntime": "react18",
  "displayName": "Time Tool",
  "entry": "dist/entry.mjs",
  "styleEntry": "dist/style.css",
  "pages": [
    {
      "pageId": "time-tool.page.main",
      "path": "/tools/time-tool",
      "title": "Time Tool",
      "mount": "tools",
      "componentExport": "TimeToolPage"
    }
  ],
  "requiredCapabilities": []
}
```

带 runner 和 bundled process 的 tool manifest：

```json
{
  "pluginId": "com.example.media-tool",
  "extensionType": "tool",
  "version": "1.0.0",
  "hostApiVersion": "0.1.0",
  "supportedDaws": [],
  "uiRuntime": "react18",
  "displayName": "Media Tool",
  "entry": "dist/entry.mjs",
  "styleEntry": "dist/style.css",
  "pages": [
    {
      "pageId": "media-tool.page.main",
      "path": "/tools/media-tool",
      "title": "Media Tool",
      "mount": "tools",
      "componentExport": "MediaToolPage"
    }
  ],
  "tools": [
    {
      "toolId": "media-tool",
      "pageId": "media-tool.page.main",
      "title": "Media Tool",
      "description": "Process local media files.",
      "order": 10,
      "runnerExport": "runMediaTool"
    }
  ],
  "toolRuntimePermissions": [
    "dialog.openFile",
    "dialog.openDirectory",
    "fs.list",
    "shell.openPath",
    "process.execBundled"
  ],
  "bundledResources": [
    {
      "resourceId": "media-tool-script",
      "kind": "script",
      "relativePath": "resources/scripts/run_tool.sh"
    },
    {
      "resourceId": "helper-binary",
      "kind": "binary",
      "relativePath": "resources/bin/helper-binary"
    }
  ],
  "requiredCapabilities": []
}
```

## 6. 页面声明 `pages`

页面条目结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `pageId` | string | 页面唯一 ID。 |
| `path` | string | 宿主路由路径。workflow 官方样例使用 `/plugins/...`；tool 使用 `/tools/...`。 |
| `title` | string | 宿主页面标题。 |
| `mount` | `"workspace"` / `"tools"` | workflow 使用 `workspace`；tool 使用 `tools`。 |
| `componentExport` | string | 入口模块导出的 React 组件名。 |

页面组件不是独立应用。宿主负责创建页面容器、注入 `context`、注入 `host`、处理导航和 plugin catalog。

## 7. 入口模块导出契约

入口模块至少导出：

```ts
import type { PluginContext, PluginManifest } from '@presto/contracts/plugins'

export const manifest: PluginManifest = {
  // 通常与 manifest.json 保持同结构
}

export function activate(context: PluginContext) {
  context.logger.info('Plugin activated')
}

export function deactivate() {
  // 可选
}
```

当前模块契约还允许：

```ts
export function resolveManifest(locale) {
  return locale.resolved === 'zh-CN' ? zhManifest : manifest
}
```

`resolveManifest(locale)` 用于本地化 manifest 展示文本。它不能改变插件身份、入口路径、权限、资源、capability 声明或页面挂载语义；这类字段应与 `manifest.json` 保持一致。

### 7.1 Workflow 入口导出

Workflow 通常导出：

```ts
export { SimpleWorkflowPage } from './SimpleWorkflowPage.mjs'
export async function loadSimpleWorkflowSettings(context) {}
export async function saveSimpleWorkflowSettings(context, nextSettings) {}
```

对应关系：

- `pages[*].componentExport` -> 页面组件导出名
- `settingsPages[*].loadExport` -> settings 加载函数导出名
- `settingsPages[*].saveExport` -> settings 保存函数导出名

### 7.2 Automation runner 导出

Automation item 的 `runnerExport` 必须存在：

```ts
export async function runSelectionAutomation(context, input) {
  const keepChannel = input.keepChannel === 'right' ? 'right' : 'left'
  await context.presto.daw.automation.splitStereoToMono.execute({ keepChannel })
  return {
    summary: `Kept ${keepChannel} channel`
  }
}
```

当前 automation runner 上下文在 `PluginContext` 基础上增加 `macAccessibility`。这仍然不是通用系统自动化权限。它只适合宿主 automation 表面已经允许的自动化执行路径。

### 7.3 Tool runner 导出

Tool 的 `tools[*].runnerExport` 必须存在：

```ts
export async function runMediaTool(context, input) {
  const execution = await context.process.execBundled(
    'media-tool-script',
    ['--input', String(input.inputPath ?? '')],
    { cwd: String(input.outputDir ?? '') },
  )

  if (!execution.ok) {
    throw new Error(execution.error?.message ?? execution.stderr ?? 'Media tool failed')
  }

  return {
    summary: 'Media processed',
    result: {
      stdout: execution.stdout
    }
  }
}
```

runner 返回值结构：

```ts
{
  summary?: string
  result?: unknown
}
```

进度和终态由宿主 job wrapper 管理，runner 不需要自行构造 `JobRecord`。

## 8. `PluginContext` 能力

`activate(context)`、页面组件 props 中的 `context`、runner context 都共享基础 `PluginContext`：

```ts
interface PluginContext {
  pluginId: string
  locale: {
    requested: 'system' | 'en' | 'zh-CN'
    resolved: 'en' | 'zh-CN'
  }
  presto: PrestoClient
  storage: PluginStorage
  logger: PluginLogger
}
```

### 8.1 `context.presto`

`context.presto` 是正式 capability SDK。常见形态：

```ts
await context.presto.system.health()
await context.presto.daw.connection.getStatus()
await context.presto.daw.session.getInfo()
await context.presto.workflow.run.start(payload)
await context.presto.jobs.get({ jobId })
```

调用前必须在 `requiredCapabilities` 里声明对应 capability ID。未声明的调用会被宿主权限守卫拒绝。

### 8.2 `context.storage`

`context.storage` 是插件本地存储，用于 settings、缓存和插件私有状态。它不应用来保存宿主全局设置，也不应用来绕过 capability。

### 8.3 `context.logger`

`context.logger` 用于插件日志。不要把用户密钥、完整本地路径清单或大体积 payload 写入日志。

### 8.4 `context.locale`

`context.locale.resolved` 是宿主解析后的语言。插件可以据此选择 UI 文案或 manifest 展示文本。

## 9. Workflow 页面 host

Workflow 页面 props：

```ts
import type { PluginWorkflowPageProps } from '@presto/contracts/plugins'

export function SimpleWorkflowPage(props: PluginWorkflowPageProps) {
  const { context, host, params, searchParams } = props
}
```

当前 workflow 页面稳定开放的 host 能力只有：

```ts
const result = await host.pickFolder()
```

返回：

```ts
{
  canceled: boolean
  paths: string[]
}
```

Workflow 页面如果需要正式执行，应调用 capability 或 workflow run：

```ts
const run = await context.presto.workflow.run.start({
  workflowId: 'com.example.simple-workflow.run',
  input: {
    sourceDir
  }
})
```

然后按 job/run ID 轮询 `jobs.get` 或现有 workflow 结果接口。不要把正式多步骤执行链写成页面里连续调用一串 capability 的事件处理器。

## 10. Tool 页面 host

Tool 页面 props：

```ts
import type { PluginToolPageProps } from '@presto/contracts/plugins'

export function MediaToolPage(props: PluginToolPageProps) {
  const { context, host } = props
}
```

当前 tool 页面 host：

| 方法 | 所需权限 | 用途 |
| --- | --- | --- |
| `host.dialog.openFile(options?)` | `dialog.openFile` | 选择文件 |
| `host.dialog.openDirectory()` | `dialog.openDirectory` | 选择目录 |
| `host.fs.readFile(path)` | `fs.read` | 读取文本文件 |
| `host.fs.writeFile(path, content)` | `fs.write` | 写入文本文件 |
| `host.fs.exists(path)` | `fs.read` | 检查路径是否存在 |
| `host.fs.readdir(path)` | `fs.list` | 列目录 |
| `host.fs.deleteFile(path)` | `fs.delete` | 删除文件 |
| `host.shell.openPath(path)` | `shell.openPath` | 用系统方式打开路径 |
| `host.runTool({ toolId, input })` | 对应 runner 权限 | 触发 `tools[]` 中声明的 runner |

页面触发 runner 示例：

```ts
const run = await host.runTool({
  toolId: 'media-tool',
  input: {
    inputPath,
    outputDir
  }
})

const jobId = run.jobId
```

`host.runTool(...)` 返回：

```ts
{
  jobId: string
  job: JobRecord
}
```

页面只拿到 job 包装后的结果，不直接执行 bundled process。真正执行逻辑应该放在 runner。

## 11. Tool 权限和 bundled resources

`toolRuntimePermissions` 当前只允许这些值：

- `dialog.openFile`
- `dialog.openDirectory`
- `fs.read`
- `fs.write`
- `fs.list`
- `fs.delete`
- `shell.openPath`
- `process.execBundled`

权限规则：

- 未声明权限就调用页面 host 或 runner host，会失败。
- 运行时会把权限缺失标成 `PLUGIN_TOOL_PERMISSION_DENIED`。
- 如果权限已声明但宿主当前没有提供对应 runtime，会失败为 `PLUGIN_TOOL_HOST_UNAVAILABLE`。
- `process.execBundled` 只能执行 manifest 中声明过的 `bundledResources`。
- `bundledResources[*].resourceId` 必须唯一。
- `bundledResources[*].kind` 只能是 `script` 或 `binary`。
- `bundledResources[*].relativePath` 必须是插件根目录内相对路径。
- bundled process 有宿主侧超时；长任务应设计为可分段、可取消或至少能清楚返回失败。

不要把用户输入直接拼成 shell 字符串。runner 应把参数作为数组传给 `execBundled(resourceId, args, options)`。

## 12. Workflow definition 编排

Workflow definition JSON 结构：

```json
{
  "workflowId": "com.example.simple-workflow.run",
  "version": "1.0.0",
  "inputSchemaId": "com.example.simple-workflow.run.v1",
  "steps": [
    {
      "stepId": "start-export",
      "usesCapability": "daw.export.run.start",
      "input": {
        "presetId": { "$ref": "input.presetId" }
      },
      "saveAs": "exportJob",
      "awaitJob": true
    }
  ]
}
```

步骤字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `stepId` | 是 | 步骤唯一 ID。 |
| `usesCapability` | 是 | 调用的 capability ID，必须已声明在 `requiredCapabilities`。 |
| `input` | 是 | capability payload，可用 `$ref` 引用输入或中间结果。 |
| `saveAs` | 否 | 保存步骤输出，供后续步骤引用。 |
| `awaitJob` | 否 | 对 job 型 capability 等待完成。 |
| `when` | 否 | 条件执行。 |
| `foreach` | 否 | 遍历集合。 |
| `steps` | 否 | `foreach` 内部步骤。 |

职责边界：

- 页面准备输入。
- `workflowCore` 做默认值、归一化和 payload 组装。
- workflow definition 做正式步骤编排。
- capability handler 执行真实动作。

## 13. Settings page

Workflow settings 是结构化声明，不是自定义整页 React 页面。

Settings page 字段：

| 字段 | 说明 |
| --- | --- |
| `pageId` | 设置页 ID。 |
| `title` | 设置页标题。 |
| `order` | 排序。 |
| `storageKey` | 插件 storage key。 |
| `defaults` | 默认配置。 |
| `loadExport` | 入口模块导出的加载函数。 |
| `saveExport` | 入口模块导出的保存函数。 |
| `sections` | 设置分组。 |

字段类型：

- `toggle`
- `select`
- `text`
- `password`
- `textarea`
- `number`
- `categoryList`

`defaults`、`loadExport`、`saveExport` 和页面读取逻辑必须使用同一个配置结构。

## 14. 本地化

当前插件上下文提供：

```ts
context.locale.requested
context.locale.resolved
```

推荐规则：

- 页面文案可按 `context.locale.resolved` 选择。
- manifest 展示文本可通过 `resolveManifest(locale)` 返回本地化副本。
- 不要在 `resolveManifest` 中改变权限、资源、入口或 capability 声明。
- 测试中应覆盖至少一种非默认语言，确保本地化不会改变插件结构。

## 15. 测试要求

第三方插件至少应覆盖：

1. manifest 结构
   - `manifest.json` 可解析。
   - 入口模块导出的 `manifest` 与 `manifest.json` 的身份、类型、入口、权限一致。
   - `requiredCapabilities` 不重复。
   - `pages[*].pageId` 不重复。
   - `automationItems[*].itemId` 不重复。
   - `bundledResources[*].resourceId` 不重复。
2. 入口模块导出
   - `activate` 存在。
   - 所有 `componentExport` 存在。
   - 所有 `loadExport` / `saveExport` 存在。
   - 所有 `runnerExport` 存在。
3. 权限闭包
   - 页面和 runner 使用的 host 能力都在 `toolRuntimePermissions` 中。
   - runner 使用的 `resourceId` 都在 `bundledResources` 中。
   - workflow definition 的 `usesCapability` 全部在 `requiredCapabilities` 中。
4. 纯逻辑
   - `workflowCore` / `toolCore` 默认值、归一化、payload 生成。
5. 页面行为
   - 页面能用注入的 mock `context` 和 `host` 渲染。
   - 关键按钮调用 `context.presto.*` 或 `host.runTool(...)`。
6. runner 行为
   - automation runner 正确调用 capability。
   - tool runner 正确调用 `process.execBundled(resourceId, args, options)`。
   - runner 对失败返回能抛出明确错误。

不要只测页面快照。插件被宿主拒绝加载通常发生在 manifest、入口导出、路径和权限闭包上。

## 16. 打包与安装检查

交付包必须满足：

- 包内有一个插件根目录，或解压后根目录本身就是插件根。
- 插件根目录下有 `manifest.json`。
- `manifest.entry` 指向存在的 `dist/entry.mjs`。
- 所有 `styleEntry`、`workflowDefinition.definitionEntry`、`bundledResources[].relativePath` 都存在。
- 所有路径都是相对路径，并且解析后仍在插件根目录内。
- 插件目录树中没有 symbolic link。
- 不包含源码构建缓存、测试 fixture、临时输出或本机绝对路径。
- bundled binary 与目标平台匹配，并具有执行权限。
- 如果脚本依赖 bundled binary，应通过相对资源路径或 runner 参数传入，不假设用户机器安装了同名命令。
- manifest 的 `pluginId`、`version` 和入口模块导出的 manifest 一致。

安装前自检清单：

```text
[ ] manifest.json 可解析
[ ] pluginId 全局唯一
[ ] extensionType 正确
[ ] hostApiVersion 当前宿主接受
[ ] uiRuntime 是 react18
[ ] workflow/automation supportedDaws 是 ["pro_tools"]
[ ] tool supportedDaws 是 []
[ ] pages 按类型挂载到 workspace/tools
[ ] requiredCapabilities 覆盖全部 capability 调用
[ ] workflowDefinition 中 usesCapability 已全部声明
[ ] automationItems 的 runnerExport 已导出
[ ] tools 的 runnerExport 已导出
[ ] toolRuntimePermissions 覆盖页面和 runner host 调用
[ ] bundledResources 资源存在且 resourceId 唯一
[ ] 所有路径都在插件根目录内
[ ] 插件目录没有 symbolic link
[ ] 页面和 runner 测试通过
```

## 17. 常见加载失败原因

| 错误类别 | 常见原因 | 修复方式 |
| --- | --- | --- |
| `hostApiVersion` 不支持 | 写了宿主校验不接受的版本 | 使用当前接受的 `0.1.0`、`1` 或 `1.0.0`。 |
| `extensionType` 不支持 | 写了非 `workflow/automation/tool` | 改成当前三类之一。 |
| `uiRuntime` 不支持 | 写了非 `react18` | 改成 `react18`。 |
| DAW target 不合法 | tool 写了 `["pro_tools"]`，或 workflow 写了预留 DAW | 按插件类型修正 `supportedDaws`。 |
| 页面挂载错误 | tool 页面写 `workspace`，workflow 页面写 `tools` | 按类型修正 `pages[*].mount`。 |
| workflow definition 缺失 | workflow 没有 `workflowDefinition` | 补 `workflowDefinition` 和 JSON 文件。 |
| capability 未声明 | workflow definition 或代码调用了未声明 capability | 补 `requiredCapabilities`。 |
| runner 找不到 | `runnerExport` 与入口模块导出名不一致 | 对齐导出名。 |
| 权限缺失 | tool 页面/runner 调了未声明 host 能力 | 补 `toolRuntimePermissions`。 |
| 资源缺失 | runner 调用未声明或不存在的 resourceId | 补 `bundledResources` 或修正路径。 |
| 路径越界 | manifest 路径使用绝对路径或 `../` 逃出插件根 | 改成插件根内相对路径。 |
| symbolic link | 包内存在 symlink | 打包时复制真实文件，不打包 symlink。 |

## 18. 官方参考样例

按类型参考：

- 复杂 workflow：`plugins/official/import-workflow`
- 轻量 workflow：`plugins/official/export-workflow`
- 最小 automation：`plugins/official/split-stereo-to-mono-automation`
- 带 options 的 automation：`plugins/official/batch-ara-backup-automation`
- bundled process tool：`plugins/official/atmos-video-mux-tool`
- 纯前端 tool：`plugins/official/time-calculator-tool`

写新插件时，应先找同类官方插件对齐目录结构、manifest、入口导出和测试，而不是从宿主内部 runtime 反推接口。
