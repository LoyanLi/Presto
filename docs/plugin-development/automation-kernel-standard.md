# 自动化内核规范

本文档描述插件执行层的当前正式标准。这里的“自动化内核”不是指插件页面，而是指正式执行路径如何落到 capability、workflow definition 和 jobs 上。

## 1. 先分两类内核

当前插件执行内核有两种形态：

1. `workflow` 插件的 `workflow-definition.json` 编排内核
2. `automation` 插件的直接 capability 内核

选择规则：

- 多步骤、可编排、可条件执行、可批量处理：用 workflow definition
- 单一步骤、单能力入口：用直接 capability automation

## 2. Workflow Definition 是正式编排层

当前 workflow definition 结构包含：

- `workflowId`
- `version`
- `inputSchemaId`
- `steps`

每个步骤当前可以使用：

- `usesCapability`
- `input`
- `saveAs`
- `awaitJob`
- `when`
- `foreach`
- `steps`

这层的职责是正式执行编排，不是页面配置文件。

## 3. `usesCapability` 规则

`usesCapability` 必须满足两条：

1. capability 本身已存在于平台
2. capability 已出现在插件的 `requiredCapabilities`

宿主会对第二条做校验。

## 4. `awaitJob` 规则

当步骤触发的是 job 型 capability 时，应使用 `awaitJob` 表达编排层需要等待该 job 完成。

适用场景：

- 导入
- 导出
- 其他明确进入 jobs 轨道的长流程

如果一个步骤只是同步查询或同步命令，不应滥用 `awaitJob`。

## 5. `foreach` 和 `when` 规则

### 5.1 `foreach`

适合表达：

- 对一组行逐个执行
- 对计划结果逐项应用 capability

这类场景在 `official.import-workflow` 的批量 rename / color / strip 步骤中已经成立。

### 5.2 `when`

适合表达：

- 条件开关
- 可选步骤
- 由用户配置或中间结果决定的执行分支

不要把这类条件只写在页面层，否则正式执行链路会失真。

## 6. 输入输出引用规则

workflow definition 当前通过 `$ref` 引用：

- `input.*`
- 上一步 `saveAs` 的结果
- `foreach` 当前项

标准要求：

- 页面只负责准备输入
- workflow definition 负责消费输入并产出正式中间结果
- capability 真正执行时不依赖页面局部状态

## 7. Workflow Core 与 Definition 的分工

不要混淆这两层：

### 7.1 workflow core

负责：

- 纯逻辑
- 默认值
- 合并和归一化
- payload 生成
- 本地工具函数

### 7.2 workflow definition

负责：

- 执行顺序
- 步骤条件
- 迭代批处理
- job 等待
- 中间结果引用

## 8. 直接 capability automation 标准

当前 `automation` 插件的执行内核标准非常小：

- 声明一个 automation item
- 绑定一个宿主已识别的 `automationType`
- 由宿主卡片调用正式 capability

当前官方参考：

- `splitStereoToMono` automation type
- `automation.splitStereoToMono.execute` capability

这说明当前 automation 插件标准不需要自定义 workflow definition。

## 9. 什么时候需要从 automation 升级到 workflow

出现以下情况，应升级为 workflow 插件：

- 需要多步 capability 编排
- 需要 settings 参与执行
- 需要条件分支或批量处理
- 需要页面确认和预览
- 需要 jobs 级进度反馈

## 10. 当前标准参考

- `official.import-workflow/dist/workflow-definition.json`
  - 多步骤、条件、循环、awaitJob 参考
- `official.export-workflow/dist/workflow-definition.json`
  - 单主步骤 job workflow 参考
- `official.split-stereo-to-mono-automation`
  - 单 capability automation 参考
