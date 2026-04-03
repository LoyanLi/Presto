# 插件开发与规范

这一组文档面向插件开发者，也面向维护插件协议的内核开发者。

## 阅读顺序

1. [SDK 与 Contracts](sdk-and-contracts.md)
2. [插件总规范](plugin-development-spec.md)
3. [插件开发流程](plugin-development-process.md)
4. [Workflow 插件规范](workflow-plugin-standard.md)
5. [Automation 插件规范](automation-plugin-standard.md)
6. [插件 UI 规范](plugin-ui-standard.md)
7. [自动化内核规范](automation-kernel-standard.md)
8. [官方插件标准参考](plugin-reference-official-plugins.md)
9. [版本与兼容性](versioning-and-compatibility.md)

## 适用问题

- 插件正式能依赖哪些接口
- `sdk-core`、`sdk-runtime`、`PluginContext`、页面 `host` 各自是什么
- 插件应该按什么顺序开发
- manifest 必须写哪些字段
- `workflow` 插件和 `automation` 插件各自怎么接入
- 插件 UI 和自动化内核应该怎么拆
- 现有官方插件分别适合作为什么标准参考
- 版本字段和兼容校验当前到底按什么规则执行

## 文档分工

- [插件总规范](plugin-development-spec.md)
  - 所有插件共享的边界、禁止项、上下文和加载规则
- [插件开发流程](plugin-development-process.md)
  - 从需求、capability 盘点、manifest 到测试交付的标准流程
- [Workflow 插件规范](workflow-plugin-standard.md)
  - 页面、settings、workflow definition、workflow core
- [Automation 插件规范](automation-plugin-standard.md)
  - automation item、最小入口、自动化卡片接入、最小执行模型
- [插件 UI 规范](plugin-ui-standard.md)
  - 页面 props、`host.pickFolder()`、settings 结构、状态和交互
- [自动化内核规范](automation-kernel-standard.md)
  - capability 编排、workflow definition、jobs、直接 capability 自动化
- [官方插件标准参考](plugin-reference-official-plugins.md)
  - `import-workflow`、`export-workflow`、`split-stereo-to-mono-automation`
