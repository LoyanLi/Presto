# Workflow 插件规范

本文档只讲 `workflow` 插件标准，参考基线来自：

- `plugins/official/import-workflow`
- `plugins/official/export-workflow`

## 1. 适用范围

以下场景应优先做成 `workflow` 插件：

- 需要工作区页面
- 需要输入和预览
- 需要 settings page
- 需要多步骤 capability 编排
- 需要 jobs 追踪
- 需要把页面交互和正式执行链路拆开

## 2. 标准目录结构

当前推荐结构：

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

其中：

- `entry.mjs`
  - 统一导出 manifest、activate、页面组件、settings 导出
- `MyWorkflowPage.mjs`
  - 页面组件
- `workflowCore.mjs`
  - 纯逻辑和 settings 逻辑
- `workflow-definition.json`
  - capability 编排内核

## 3. Manifest 标准

`workflow` 插件当前至少要具备：

- `extensionType: "workflow"`
- 至少一项 `pages`
- `workflowDefinition`
- `requiredCapabilities`

按现有官方插件的标准，通常还会具备：

- `styleEntry`
- `settingsPages`

### 3.1 页面字段

页面定义当前必须满足：

- `mount` 只能是 `workspace`
- `componentExport` 必须和入口模块导出一致
- 页面路径应稳定，不要把临时参数写入固定 path

### 3.2 Settings 字段

如果声明了 `settingsPages`，则：

- `loadExport` 必须有实际导出
- `saveExport` 必须有实际导出
- `defaults` 应与 `workflowCore` 的默认值保持一致

### 3.3 Workflow Definition 字段

当前 workflow 插件校验和官方实现都要求：

- `workflowId`
- `inputSchemaId`
- `definitionEntry`

这三者必须和实际 `workflow-definition.json` 对齐。

## 4. 入口模块标准

workflow 插件入口模块当前标准形态是：

1. 导入页面组件
2. 导入 settings / workflow core 逻辑
3. 导出 `manifest`
4. 导出 `activate(context)`
5. 导出页面组件
6. 导出 settings 加载 / 保存函数

按现有标准，`activate(context)` 通常只做轻量动作：

- 记录 `pluginId`
- 写日志

不要把流程执行逻辑塞到 `activate()`。

## 5. 页面层标准

页面层负责：

- 用户输入
- 本地状态
- 数据预览
- 局部校验提示
- 触发 capability 或 workflow.run.start
- 轮询 jobs 并展示进度

页面层不负责：

- capability 编排
- 持久化协议设计
- 把多步骤执行路径硬编码成页面事件链

## 6. Workflow Core 标准

按 `import-workflow` 和 `export-workflow` 的当前模式，`workflowCore` 应承接这些职责：

- 默认值工厂
- settings 合并与归一化
- storage 读写包装
- payload 构造
- 纯函数工具
- 名称校验、快照校验、路径处理、颜色计算等本地规则

这层应该尽量保持纯逻辑，不依赖页面组件生命周期。

## 7. Workflow Definition 标准

如果你的执行链是正式多步骤流程，就应当放到 `workflow-definition.json`，而不是写死在页面组件中。

当前 workflow definition 适合承接：

- 按顺序执行多个 capability
- 对 job 型步骤使用 `awaitJob`
- 条件执行
- 批量迭代
- 中间结果引用

## 8. Settings 标准

workflow 插件的 settings page 当前是结构化声明，不是自定义整页 UI。

推荐规则：

- 把可持久化配置集中到 `settingsPages`
- 把默认值来源放在 workflow core
- 页面运行时只读取归一化后的 settings
- `settingsPages.defaults` 和 `load/save` 必须一致

## 9. 当前标准参考

### 9.1 `official.import-workflow`

适合作为以下标准参考：

- 复杂 workflow 页面
- 多段 settings
- `workflowCore` 中的归一化、默认值和纯逻辑
- 多步骤 `workflow-definition.json`

### 9.2 `official.export-workflow`

适合作为以下标准参考：

- 较轻量的 workflow 页面
- 快照 / 预设类本地状态
- settings 与 workflow 分工
- 简单的单 job workflow definition

## 10. 自检清单

- 有页面时，`pages[*].componentExport` 与模块导出一致
- 有 settings 时，`loadExport` / `saveExport` 已导出
- 有 workflow definition 时，引用字段与 JSON 文件一致
- 页面、workflow core、workflow definition 三层职责没有混淆
- 需要的 capability 全部出现在 `requiredCapabilities`
