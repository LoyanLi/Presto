# 插件 UI 规范

本文档只描述插件 UI 层的当前正式边界，包括页面组件、settings page 和页面可用的宿主辅助能力。

## 1. UI 主要存在于三种地方

当前插件 UI 主要存在于三类表面：

1. `workflow` 插件页面
2. `tool` 插件页面
3. workflow 插件的结构化 settings page

当前官方 automation 插件不自带页面 UI，而是由宿主根据 `automationType` 渲染自动化卡片。

## 2. 页面组件输入边界

当前插件页面有两种 props：

- workflow 页：`PluginWorkflowPageProps`
- tool 页：`PluginToolPageProps`

其中：

- `context` 是正式插件上下文
- `host` 是页面宿主辅助对象

不要把页面 props 理解成宿主 runtime 直通。

## 3. workflow 页面 `host.pickFolder()` 的使用边界

当前稳定开放的页面 host 能力只有：

- `host.pickFolder()`

适用场景：

- 选择源目录
- 选择导出目录
- 需要用户显式指定文件夹路径的页面流程

不适用场景：

- 把 `host` 当文件系统 API 使用
- 依赖更多未开放的 dialog / shell / fs 能力
- 在 `activate(context)` 中调用页面 host

## 4. tool 页面 host 能力边界

`tool` 页面当前稳定开放这些 host 能力：

- `host.dialog.openFile()`
- `host.dialog.openDirectory()`
- `host.fs.readFile(path)`
- `host.fs.writeFile(path, content)`
- `host.fs.exists(path)`
- `host.fs.readdir(path)`
- `host.fs.deleteFile(path)`
- `host.shell.openPath(path)`
- `host.runTool({ toolId, input })`

使用规则：

- 这些能力只在页面渲染时可用
- 不能把它们当成 `activate(context)` 的通用 runtime
- 只应围绕工具页面输入、预检、结果展示使用
- 执行本地工具链时，页面调用 `host.runTool(...)`，runner 再调用 `process.execBundled(...)`

`host.runTool(...)` 返回宿主 job 包装：

```ts
{
  jobId: string
  job: JobRecord
}
```

因此 tool 页面应展示 job 状态或结果摘要，不应假设能直接拿到 runner 内部 stdout/stderr。

## 5. 页面层职责

页面层应负责：

- 表单输入
- 临时选择状态
- 列表和预览
- 错误展示
- 作业进度展示
- 调用 `context.presto.*` 或 `workflow.run.start(...)`

页面层不应负责：

- capability 编排 DSL
- 复杂纯逻辑规则堆积
- settings 数据模型定义

## 6. 当前页面状态标准

参考 `import-workflow` 和 `export-workflow`，推荐把页面状态拆成几类：

- 数据输入状态
- 异步忙碌状态
- 错误状态
- 当前步骤状态
- job 轮询状态

不要把所有状态揉成一个难以推导的总对象。

## 7. 作业型 UI 标准

如果 capability 会返回 job 或 workflow run：

- 页面应显式展示当前 phase / stage
- 轮询 `jobs.get`
- 对终态和非终态分开处理
- 错误消息要能落到页面，而不是只写日志

这类行为在 `workflow` 页面中是 UI 职责的一部分，不应被隐藏到宿主之外。

## 8. Settings Page 标准

settings page 当前不是插件自带整页 React UI，而是结构化声明模型。

settings page 应描述：

- `pageId`
- `title`
- `storageKey`
- `defaults`
- `loadExport`
- `saveExport`
- `sections`

字段类型当前支持：

- `toggle`
- `select`
- `text`
- `password`
- `textarea`
- `number`
- `categoryList`

## 9. Settings 层职责

settings page 负责：

- 持久化配置的结构化表达
- 宿主统一渲染
- 默认值和保存路径的统一

settings page 不负责：

- 自定义整个设置容器
- 绕过宿主存储
- 混入运行时临时状态

`tool` 插件的扩展管理入口与 workflow 分离，归在 `Tool Extensions` 页面，不应混写到 workflow 扩展管理语义里。

## 10. 样式组织标准

当前官方 workflow 插件都通过 `styleEntry` 引入独立样式文件。

推荐规则：

- 插件页面局部样式放在插件自己的 `styleEntry`
- 结构和语义由页面模块控制
- 不依赖宿主私有样式细节

对 `tool` 页面，当前还应额外遵守这些 UI 收口规则：

- 能复用 workflow shell 组件时，不再单独造一套工具页容器
- 宿主已经提供标题的页面，不要在插件内部再渲染第二个 page header
- 文件选择、输出选择和结果展示都优先走紧凑表达，不重复展示相同路径
- 底部操作栏视觉和行为应与 workflow action bar 对齐，而不是做成独立浮层或带重边框的工具条

## 11. 当前标准参考

- `official.import-workflow`
  - 适合参考复杂表单、步骤流、列表预览、批量状态
- `official.export-workflow`
  - 适合参考快照管理、预设选择、导出进度展示
- `official.atmos-video-mux-tool`
  - 适合参考 tool 页面文件选择、工具链预检与执行参数组织

## 12. 自检清单

- 页面只用了 `context` 和受限 `host`
- 没有把 UI 事件直接扩展成宿主私有调用
- settings 结构和导出一致
- job 型流程有明确进度、终态和错误展示
- tool 页面仅使用已开放的 `dialog/fs/shell` 子集
- tool 页面通过 `host.runTool(...)` 触发 runner，没有在页面层执行 bundled process
