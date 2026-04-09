# Presto Docs

当前文档只保留两块主文档区：

- [内核开发](kernel-development/README.md)
- [插件开发与规范](plugin-development/README.md)

历史执行计划和发布说明继续保留在原目录：

- [实施计划](plans/)
- [发布记录](releases/)

## 如何选入口

如果你要改宿主、Rust runtime、后端、contracts、通信边界，先读：

1. [内核开发总览](kernel-development/README.md)
2. [架构总览](kernel-development/architecture-overview.md)
3. [Contracts 与通信边界](kernel-development/contracts-and-communication.md)

如果你要写插件、更新插件协议、核对 manifest 规则，先读：

1. [插件开发总览](plugin-development/README.md)
2. [SDK 与 Contracts](plugin-development/sdk-and-contracts.md)
3. [插件总规范](plugin-development/plugin-development-spec.md)
4. [插件开发流程](plugin-development/plugin-development-process.md)
5. [Workflow 插件规范](plugin-development/workflow-plugin-standard.md)
6. [Automation 插件规范](plugin-development/automation-plugin-standard.md)

## 文档原则

- 只写当前代码已经成立的事实。
- 不把类型预留、目录预留、历史实现路径写成当前能力。
- 同一主题只保留一份权威说明，避免平铺文档重复描述。
