# Plugin Backend Boundary Design

**Date:** 2026-03-30

**Goal:** 将 Presto 收敛为严格的前后端分离架构：插件只负责定义页面、设置、命令与 capability 入口，不再持有任何宿主执行能力；所有执行统一由后端 capability / job 完成。

## 1. 背景与问题

当前项目的插件边界与目标不一致。

- 插件 `PluginContext` 仍然包含 `runtime`。
- `PluginRuntime` 当前暴露 `fs`、`shell`、`mobileProgress`、`macAccessibility`、`automation` 等执行型宿主能力。
- `guardRuntimeAccess` 的作用是裁剪插件执行权限，而不是取消插件执行权限。
- 官方插件已经直接消费这些运行时服务，实际承担目录选择、文件读写、打开路径、移动端进度会话管理等行为。
- 部分自动化执行逻辑仍位于 Electron 主进程，而不是后端能力层。

这导致系统虽然有后端 capability 主干，但插件仍然可以直接驱动宿主和外部系统，不符合“插件只负责定义，执行全部由后端操作，插件不控制任何外部 app”的目标。

## 2. 目标边界

目标边界只有一条：

- 插件只负责定义，不负责执行。

展开后具体为：

- 插件只允许声明页面、设置结构、命令、automation item 和 capability 需求。
- 插件 UI 只允许收集用户输入、展示结果、轮询 job、展示状态。
- 插件不再直接访问任何宿主运行时服务。
- 插件不再直接触碰文件系统、shell、系统对话框、mobile progress、mac accessibility、AppleScript、automation definition 执行。
- 所有外部副作用统一进入后端 capability / job。
- Electron 主进程只负责宿主桥接、后端监督和宿主自身内部能力，不再作为插件可调用的执行层。

## 3. 不接受的方案

以下方案都不满足目标，因此不采用：

- 保留 `runtime`，只删除一部分高风险服务。
- 把插件调用改成 host command，再由 host 执行。
- 同时保留旧 runtime 路径和新 capability 路径。
- 引入兼容层、双轨制、降级路径。

这些做法都没有真正取消插件执行权，只是换了包装层。

## 4. 新的职责划分

### 4.1 插件层

插件只保留以下职责：

- 定义页面入口
- 定义设置页结构
- 定义命令和 automation item
- 定义 capability 依赖
- 在页面中组织 payload 并调用 `context.presto.*`
- 读取 `context.storage`
- 使用 `context.logger`
- 展示 job 状态和结果

插件不再拥有任何 runtime 执行 API。

### 4.2 前端宿主层

前端宿主只负责：

- 插件发现、加载、挂载
- 页面渲染
- 后端调用桥接
- job 状态展示
- 宿主自身内部 UI 交互

前端宿主不再向插件注入执行型 API。

### 4.3 Electron 主进程

Electron 主进程只负责：

- 应用生命周期
- 后端监督
- IPC 桥接
- 宿主自身使用的桌面能力

主进程不再提供“插件可调用的 runtime 服务”。

### 4.4 后端

后端统一负责：

- 所有副作用执行
- 文件系统访问
- 外部 app / DAW / UI automation
- 导入导出工作流执行
- mobile progress 会话和状态
- 参数校验
- 错误归一化
- job 生命周期管理

## 5. 协议调整

### 5.1 插件上下文

`PluginContext` 收敛为：

- `pluginId`
- `locale`
- `presto`
- `storage`
- `logger`

删除：

- `runtime`

### 5.2 插件协议

删除整套 runtime 协议：

- `PluginRuntime`
- `PluginRuntimeServiceName`
- `requiredRuntimeServices`
- runtime service manifest 事实源
- runtime 权限守卫

插件 manifest 中不再出现 runtime service 权限声明。

### 5.3 能力协议

所有插件可触发的执行行为统一通过 capability 暴露。

能力按两类组织：

- 即时能力：同步或单次请求返回
- job 能力：异步执行，由 `jobs.*` 查询状态

插件调用模型统一为：

1. 页面收集参数
2. 调用 capability
3. 若返回 jobId，则通过 `jobs.get` / `jobs.list` 轮询
4. 展示结果

## 6. 对当前实现的具体收敛

### 6.1 需要删除的面

- `packages/contracts/src/plugins/runtime.ts`
- `packages/contracts-manifest/runtime-services.json`
- `packages/contracts-manifest/plugin-permissions.json`
- `host-plugin-runtime/src/permissions/guardRuntimeAccess.ts`

### 6.2 需要修改的面

- `packages/contracts/src/plugins/context.ts`
- `host-plugin-runtime/src/permissions/createPluginRuntime.ts`
- `frontend/host/pluginHostRuntime.ts`
- 插件 manifest 校验与发现逻辑
- 插件与 SDK 文档

### 6.3 需要迁回后端的执行逻辑

- Electron `automationRuntime.mjs` 中的 definition 读取与脚本执行
- Import 插件中的目录扫描与分析缓存读写
- Export 插件中的快照持久化、mobile progress、打开目录

这些行为都必须改为后端 capability / job 的内部实现。

## 7. 官方插件重写原则

### 7.1 import-workflow

重写后：

- 插件不再自己选择目录
- 插件不再自己扫描文件
- 插件不再自己读写分析缓存
- 插件只提交输入参数并展示后端返回的分析与执行结果

### 7.2 export-workflow

重写后：

- 插件不再自己管理 mobile progress session
- 插件不再自己读写 preset / snapshot 文件
- 插件不再自己打开输出目录
- 插件只发起导出 job 并展示进度与结果

### 7.3 split-stereo-to-mono-automation

重写重点不是插件页面，而是执行链路：

- 插件继续只声明 automation item 和 capability
- capability 的真正执行必须完全位于 backend
- Electron 不再承载该 capability 的执行实现

## 8. 迁移顺序

按最短正确路径分四步：

1. 删除插件 runtime 协议与权限体系。
2. 调整插件上下文和宿主装配，宿主不再注入 runtime。
3. 将当前前端和主进程中的执行逻辑迁回后端 capability / job。
4. 重写官方插件和文档，使其只保留声明与输入组织职责。

整个过程不保留兼容层，不允许新旧边界共存。

## 9. 完成判定

以下条件同时成立，才算边界改造完成：

- 插件协议中不再存在 `runtime`
- 插件 manifest 中不再存在 `requiredRuntimeServices`
- 插件代码中不再调用宿主执行 API
- Electron 主进程中不再存在插件执行入口
- 所有外部副作用都可追踪到 backend capability / job
- 文档明确声明插件只负责定义，执行全部后端化
