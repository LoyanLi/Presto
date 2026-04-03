# 插件 UI 规范

本文档只描述插件 UI 层的当前正式边界，包括页面组件、settings page 和页面可用的宿主辅助能力。

## 1. UI 只存在于两种地方

当前插件 UI 主要存在于两类表面：

1. `workflow` 插件页面
2. workflow 插件的结构化 settings page

当前官方 automation 插件不自带页面 UI，而是由宿主根据 `automationType` 渲染自动化卡片。

## 2. 页面组件输入边界

当前插件页面组件收到的是 `PluginPageProps`：

- `context`
- `host`
- `params`
- `searchParams`

其中：

- `context` 是正式插件上下文
- `host` 是页面宿主辅助对象

不要把页面 props 理解成宿主 runtime 直通。

## 3. `host.pickFolder()` 的使用边界

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

## 4. 页面层职责

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

## 5. 当前页面状态标准

参考 `import-workflow` 和 `export-workflow`，推荐把页面状态拆成几类：

- 数据输入状态
- 异步忙碌状态
- 错误状态
- 当前步骤状态
- job 轮询状态

不要把所有状态揉成一个难以推导的总对象。

## 6. 作业型 UI 标准

如果 capability 会返回 job 或 workflow run：

- 页面应显式展示当前 phase / stage
- 轮询 `jobs.get`
- 对终态和非终态分开处理
- 错误消息要能落到页面，而不是只写日志

这类行为在 `workflow` 页面中是 UI 职责的一部分，不应被隐藏到宿主之外。

## 7. Settings Page 标准

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

## 8. Settings 层职责

settings page 负责：

- 持久化配置的结构化表达
- 宿主统一渲染
- 默认值和保存路径的统一

settings page 不负责：

- 自定义整个设置容器
- 绕过宿主存储
- 混入运行时临时状态

## 9. 样式组织标准

当前官方 workflow 插件都通过 `styleEntry` 引入独立样式文件。

推荐规则：

- 插件页面局部样式放在插件自己的 `styleEntry`
- 结构和语义由页面模块控制
- 不依赖宿主私有样式细节

## 10. 当前标准参考

- `official.import-workflow`
  - 适合参考复杂表单、步骤流、列表预览、批量状态
- `official.export-workflow`
  - 适合参考快照管理、预设选择、导出进度展示

## 11. 自检清单

- 页面只用了 `context` 和受限 `host`
- 没有把 UI 事件直接扩展成宿主私有调用
- settings 结构和导出一致
- job 型流程有明确进度、终态和错误展示
